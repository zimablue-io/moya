import { act } from "./act.ts"
import { runQuery } from "./query.ts"
import { compileSpeech } from "./speak.ts"
import type { EnvState, Receipt } from "./types.ts"

export async function applyLocalIntent(
	env: EnvState,
	userText: string,
): Promise<{ env: EnvState; receipts: Receipt[]; spoken: string }> {
	const q = userText.trim()
	const lower = q.toLowerCase()
	const current = env
	const receipts: Receipt[] = []

	const remember = q.match(/remember(?:\s+that)?\s+(.+)/i)
	if (remember?.[1]) {
		const result = await act(current, "memory.write", { kind: "preference", text: remember[1].trim() })
		return done(result.env, [result.receipt], `Kept. ${remember[1].trim()}`)
	}

	const forget = q.match(/forget(?:\s+that)?\s+(.+)/i)
	if (forget?.[1]) {
		const queried = runQuery(current, { domain: "lived", q: forget[1].trim() })
		receipts.push(queried.receipt)
		const lived = queried.receipt.data as { lived?: { memories?: { id: string; text: string }[] } }
		const hits = lived.lived?.memories ?? []
		if (hits.length === 1 && hits[0]) {
			const result = await act(current, "memory.forget", { id: hits[0].id })
			return done(result.env, [...receipts, result.receipt], result.receipt.ok ? "Forgotten." : result.receipt.summary)
		}
		return done(current, receipts, "I need a single memory id from query to forget.")
	}

	const hours = q.match(/log\s+(\d+(?:\.\d+)?)\s*(h|hr|hour|hours)\s*(?:on|of|to)?\s*(.*)/i)
	if (hours) {
		const result = await act(current, "time.log", {
			hours: Number(hours[1]),
			category: hours[3]?.trim() || "work",
			note: q,
		})
		return done(result.env, [result.receipt], result.receipt.summary)
	}

	if (/analyze|insight|pattern|how am i spending|where does my time/.test(lower)) {
		const result = await act(current, "lived.analyze", { focus: q })
		return done(result.env, [result.receipt], result.receipt.summary)
	}

	if (/needs? me|loop me in|don't let me forget|remind me/.test(lower)) {
		const title = q.replace(/^.*?(?:remind me to|loop me in(?: on)?|don't let me forget)\s+/i, "").slice(0, 80)
		const result = await act(current, "inbox.add", { title: title || "Needs you", body: q, severity: "need" })
		return done(result.env, [result.receipt], "Queued. It will sit in Watch until you clear it.")
	}

	if (/watch\s+(.+)/i.test(q) && !/watchboard|watching/.test(lower)) {
		const name = q.match(/watch\s+(.+)/i)?.[1]?.trim()
		if (name) {
			const result = await act(current, "board.upsert", { name, summary: `Watching ${name}.`, items: [] })
			return done(result.env, [result.receipt], `I started a board for ${name}.`)
		}
	}

	const every = q.match(/every\s+(\d+)\s*(min|mins|minutes|hour|hours)\s+(.+)/i)
	if (every) {
		const n = Number(every[1])
		const unit = every[2].startsWith("hour") ? n * 60 : n
		const result = await act(current, "routine.upsert", {
			name: every[3].slice(0, 40),
			brief: every[3],
			triggerType: "interval",
			everyMinutes: unit,
		})
		return done(result.env, [result.receipt], `Routine set. Every ${every[1]} ${every[2]} I will: ${every[3]}`)
	}

	if (/close (that|it|this|the (?:window|dialog|visual))/.test(lower)) {
		const result = await act(current, "ui.close", {})
		return done(result.env, [result.receipt], result.receipt.summary)
	}

	if (/overview of (?:my )?projects|my projects|what am i working on/.test(lower)) {
		const result = await act(current, "ui.open", { view: "projects" })
		return done(result.env, [result.receipt], emptyProjectsSpeech(result.env))
	}

	if (/what.?s on today|this week|my calendar/.test(lower)) {
		const result = await act(current, "ui.open", { view: "calendar" })
		return done(result.env, [result.receipt], emptyCalendarSpeech(result.env))
	}

	return {
		env: current,
		receipts,
		spoken: localFallback(q, current),
	}
}

function done(env: EnvState, receipts: Receipt[], spoken: string) {
	return { env, receipts, spoken: compileSpeech(receipts, spoken) }
}

function emptyProjectsSpeech(env: EnvState): string {
	const boards = env.snapshot.boards.length
	const work = env.snapshot.sources.filter((s) => s.kind === "work").length
	if (boards === 0 && work === 0) {
		return "No projects yet. Pick Linear or GitHub in Settings → Sources, or start a board."
	}
	return "Opened Watch → Boards."
}

function emptyCalendarSpeech(env: EnvState): string {
	if (!env.snapshot.sources.some((s) => s.kind === "calendar")) {
		return "No calendar source. Pick a calendar in Settings → Sources."
	}
	return "Opened Watch → Time."
}

function localFallback(userText: string, env: EnvState): string {
	const q = userText.toLowerCase()
	const snap = env.snapshot
	if (/what do you remember|memories|memory/.test(q)) {
		if (!snap.memories.length) return "Nothing durable yet. Tell me to remember something, or add it in Memory."
		return `I am holding ${snap.memories.length}. Open Memory to read them.`
	}
	if (/routine|automat/.test(q)) {
		const n = snap.automations.filter((a) => a.enabled).length
		return n
			? `${n} routine${n === 1 ? "" : "s"} running. Open Routines to see them.`
			: "No routines yet. Open Routines, or say something like: every 60 minutes scan the boards."
	}
	if (/hello|hey|hi |good morning|good evening/.test(q)) {
		return "Here. Hold the core to talk, or type if you would rather."
	}
	return "The model is not connected, so I am running on local memory only. I can still remember, log time, keep boards, and queue things that need you. Add a provider in Settings when you want a full mind."
}
