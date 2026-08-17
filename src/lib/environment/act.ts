import type { Automation } from "../types.ts"
import { nowIso } from "../utils.ts"
import { actChrome } from "./act-chrome.ts"
import { actLived } from "./act-lived.ts"
import { actRemote } from "./act-remote.ts"
import { type ActResult, fail, ok, parseArgs, str } from "./act-result.ts"
import { actSource } from "./act-source.ts"
import { isForbiddenCommand, isKnownCommand, resolveCommandName } from "./catalog.ts"
import { runQuery } from "./query.ts"
import { cloneEnv } from "./state.ts"
import type { EnvState, Receipt } from "./types.ts"

export async function act(env: EnvState, name: string, raw: string | Record<string, unknown> = {}): Promise<ActResult> {
	if (isForbiddenCommand(name)) {
		return fail(name, "That command does not exist.", env)
	}
	const command = resolveCommandName(name)
	if (command === "query") {
		const args = parseArgs(raw)
		const result = runQuery(env, {
			domain: (str(args, "domain") || "all") as "lived" | "ui" | "sources" | "transcript" | "calendar" | "work" | "all",
			q: str(args, "q") || str(args, "query") || undefined,
			day: str(args, "day") || undefined,
		})
		return { env, receipt: result.receipt }
	}
	if (!isKnownCommand(command)) {
		return fail(command, `Unknown command: ${name}.`, env)
	}

	const args = parseArgs(raw)
	const next = cloneEnv(env)
	const ctx = { command, env, next, args }

	if (command === "routine.run") {
		const id = str(args, "id")
		if (!id) return fail(command, "Routine id required.", env)
		const auto = next.snapshot.automations.find((a) => a.id === id)
		if (!auto) return fail(command, "Routine not found.", env)
		const ran = await runLocalRoutine(next, auto)
		ran.env.snapshot.automations = ran.env.snapshot.automations.map((a) =>
			a.id === id ? { ...a, lastRunAt: nowIso(), lastResult: ran.summary } : a,
		)
		return ok(command, ran.summary, ran.env, { id, receipts: ran.receipts })
	}

	const handled = actLived(ctx) ?? actChrome(ctx) ?? (await actSource(ctx)) ?? (await actRemote(ctx))
	return handled ?? fail(command, `Unknown command: ${name}.`, env)
}

export async function runLocalRoutine(
	env: EnvState,
	auto: Automation,
): Promise<{ env: EnvState; receipts: Receipt[]; summary: string }> {
	const brief = auto.brief.toLowerCase()
	let current = env
	const receipts: Receipt[] = []

	if (/analy|brief|review|summar|evening|morning/.test(brief)) {
		const result = await act(current, "lived.analyze", { focus: auto.name })
		current = result.env
		receipts.push(result.receipt)
	}

	if (/inbox|loop|need|blocked|watch/.test(brief)) {
		const blocked = current.snapshot.boards.flatMap((b) =>
			(b.items ?? []).filter((it) => it.needsInput || it.state === "blocked").map((it) => `${b.name}: ${it.label}`),
		)
		if (blocked.length) {
			const result = await act(current, "inbox.add", {
				title: `${auto.name}: needs you`,
				body: blocked.join("; "),
				severity: "need",
				source: auto.name,
			})
			current = result.env
			receipts.push(result.receipt)
		}
	}

	if (/remember|memor|decision|preference/.test(brief)) {
		const recent = current.snapshot.messages.filter((m) => m.role === "user").slice(-4)
		if (recent[0]) {
			const result = await act(current, "memory.write", {
				kind: "insight",
				text: `From ${auto.name}: ${recent
					.map((m) => m.content)
					.join(" / ")
					.slice(0, 280)}`,
			})
			current = result.env
			receipts.push(result.receipt)
		}
	}

	const summary =
		receipts
			.filter((r) => r.ok)
			.map((r) => r.summary)
			.join(" ") || "The routine produced no changes."
	return { env: current, receipts, summary }
}

export async function dispatch(
	env: EnvState,
	name: string,
	raw: string | Record<string, unknown> = {},
): Promise<ActResult> {
	if (name.startsWith("mcp__")) {
		const parts = name.split("__")
		return act(env, "mcp.call", {
			serverId: parts[1],
			tool: parts.slice(2).join("__"),
			args: parseArgs(raw),
		})
	}
	return act(env, name, raw)
}
