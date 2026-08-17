import { matchPhraseAutomations } from "../automations.ts"
import { type ChatMessage, type ChatTool, completeTurn } from "../llm.ts"
import type { Message } from "../types.ts"
import { nowIso, uid } from "../utils.ts"
import { dispatch, runLocalRoutine } from "./act.ts"
import { catalogTools } from "./catalog.ts"
import { applyLocalIntent } from "./intent.ts"
import { buildCapabilityPrompt } from "./prompt.ts"
import { runQuery } from "./query.ts"
import { compileSpeech, honestyFromWorld, needsWorldFacts, summarizeReceipts } from "./speak.ts"
import { cloneEnv } from "./state.ts"
import type { EnvState, Receipt } from "./types.ts"

export type TurnKind = "text" | "voice" | "routine"

export type CompleteFn = typeof completeTurn

export type TurnInput = {
	env: EnvState
	text: string
	kind: TurnKind
	routineId?: string
	appendUser?: boolean
	complete?: CompleteFn
	extra?: string
}

export type TurnResult = {
	env: EnvState
	spoken: string
	receipts: Receipt[]
	error?: string
}

function mcpTools(env: EnvState): ChatTool[] {
	return env.snapshot.mcpServers
		.filter((s) => s.enabled)
		.flatMap((s) =>
			(s.tools ?? []).map((t) => ({
				type: "function" as const,
				function: {
					name: `mcp__${s.id}__${t.name}`,
					description: `[${s.name}] ${t.description}`,
					parameters: (t.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
				},
			})),
		)
}

export function toolsFor(env: EnvState): ChatTool[] {
	return [...catalogTools(), ...mcpTools(env)]
}

function toChat(messages: Message[]): ChatMessage[] {
	return messages
		.filter((m) => !m.hidden && (m.role === "user" || m.role === "assistant" || m.role === "tool"))
		.slice(-20)
		.map((m) => {
			if (m.role === "tool") {
				return {
					role: "tool" as const,
					content: m.content,
					name: m.toolName ?? "tool",
					tool_call_id: m.id,
				}
			}
			return { role: m.role as "user" | "assistant", content: m.content }
		})
}

function addAssistant(env: EnvState, spoken: string): EnvState {
	const next = cloneEnv(env)
	const em = /sorry|cannot|can't|blocked|urgent/i.test(spoken)
		? "concerned"
		: /good|glad|nice|yes/i.test(spoken)
			? "warm"
			: "calm"
	const reply: Message = {
		id: uid("a"),
		role: "assistant",
		content: spoken,
		createdAt: nowIso(),
		emotion: em,
		artifacts: next.ui.artifact ? [next.ui.artifact] : undefined,
	}
	next.snapshot.messages = [...next.snapshot.messages, reply]
	return next
}

export async function runTurn(input: TurnInput): Promise<TurnResult> {
	let env = cloneEnv(input.env)
	const receipts: Receipt[] = []
	const text = input.text.trim()
	if (!text && input.kind !== "routine") {
		return { env, spoken: "I have nothing to add.", receipts }
	}

	if (input.appendUser !== false && text) {
		env.snapshot.messages = [
			...env.snapshot.messages,
			{ id: uid("u"), role: "user", content: text, createdAt: nowIso() },
		]
	}

	if (input.kind !== "routine") {
		const triggered = matchPhraseAutomations(env.snapshot.automations, text)
		for (const auto of triggered) {
			const ran = await runLocalRoutine(env, auto)
			env = ran.env
			receipts.push(...ran.receipts)
			env.snapshot.automations = env.snapshot.automations.map((a) =>
				a.id === auto.id ? { ...a, lastRunAt: nowIso(), lastResult: ran.summary } : a,
			)
		}
	}

	if (input.kind === "routine" && input.routineId) {
		const auto = env.snapshot.automations.find((a) => a.id === input.routineId)
		if (auto) {
			const ran = await runLocalRoutine(env, auto)
			env = ran.env
			receipts.push(...ran.receipts)
		}
	}

	const complete = input.complete ?? completeTurn
	const chat: ChatMessage[] = [
		{ role: "system", content: buildCapabilityPrompt(env, input.extra) },
		...toChat(env.snapshot.messages),
	]
	if (input.kind === "routine") {
		chat.push({
			role: "user",
			content: text || "Run the routine. Use query and act. Do not narrate work you did not do.",
		})
	}

	let modelText = ""
	let error: string | undefined
	try {
		for (let hop = 0; hop < 4; hop++) {
			const res = await complete({
				provider: env.snapshot.settings.provider,
				messages: chat,
				tools: toolsFor(env),
			})
			if (!res.ok) {
				error = res.error
				break
			}
			if (res.toolCalls.length) {
				chat.push({
					role: "assistant",
					content: res.content ?? "",
					tool_calls: res.toolCalls.map((c) => ({
						id: c.id,
						type: "function",
						function: { name: c.name, arguments: c.arguments },
					})),
				})
				for (const call of res.toolCalls) {
					const result = await dispatch(env, call.name, call.arguments)
					env = result.env
					receipts.push(result.receipt)
					const content = JSON.stringify({
						ok: result.receipt.ok,
						summary: result.receipt.summary,
						data: result.receipt.data ?? null,
					})
					chat.push({
						role: "tool",
						content,
						name: call.name,
						tool_call_id: call.id,
					})
					env.snapshot.messages = [
						...env.snapshot.messages,
						{
							id: call.id,
							role: "tool",
							content,
							createdAt: nowIso(),
							toolName: call.name,
							hidden: true,
						},
					]
				}
				continue
			}
			modelText = (res.content ?? "").trim()
			break
		}
	} catch (err) {
		error = err instanceof Error ? err.message : "Something went wrong."
	}

	if (needsWorldFacts(text) && !receipts.some((r) => r.command === "query")) {
		const forced = runQuery(env, { domain: "all" })
		receipts.push(forced.receipt)
	}

	if (error && !receiptsClaimOrLocal(receipts) && text) {
		const local = await applyLocalIntent(env, text)
		env = local.env
		receipts.push(...local.receipts)
		if (local.spoken) {
			const spoken = compileSpeech(receipts, local.spoken)
			return { env: addAssistant(env, spoken), spoken, receipts, error }
		}
	}

	let spoken = compileSpeech(receipts, modelText)
	if (!spoken || /^done\.?$/i.test(spoken)) spoken = summarizeReceipts(receipts)
	spoken = honestyFromWorld(text, receipts, spoken)
	if (input.kind === "routine" && !receipts.some((r) => r.ok && r.command !== "query")) {
		spoken = "The routine produced no changes."
	}

	if (input.kind === "routine" && /^(ok|okay|done|quiet|nothing|all clear|noted)[.!]?$/i.test(spoken)) {
		if (input.routineId) {
			env.snapshot.automations = env.snapshot.automations.map((a) =>
				a.id === input.routineId ? { ...a, lastRunAt: nowIso(), lastResult: spoken } : a,
			)
		}
		return { env, spoken, receipts, error }
	}

	if (input.routineId) {
		env.snapshot.automations = env.snapshot.automations.map((a) =>
			a.id === input.routineId ? { ...a, lastRunAt: nowIso(), lastResult: spoken } : a,
		)
	}

	return { env: addAssistant(env, spoken), spoken, receipts, error }
}

function receiptsClaimOrLocal(receipts: Receipt[]): boolean {
	return receipts.some((r) => r.ok && r.command !== "query")
}
