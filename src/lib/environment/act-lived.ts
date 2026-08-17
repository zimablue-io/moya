import { isTranscriptTurn, localDayKey, transcriptStats } from "../transcript.ts"
import {
	type Board,
	type BoardItemState,
	type InboxItem,
	type InboxSeverity,
	type Memory,
	type MemoryKind,
	type TimeLog,
} from "../types.ts"
import { hoursBetween, nowIso, uid } from "../utils.ts"
import { type ActCtx, type ActResult, bool, fail, ok, str } from "./act-result.ts"
import type { EnvState } from "./types.ts"

function analyzeBody(env: EnvState, focus: string): string {
	const turns = env.snapshot.messages.filter(isTranscriptTurn)
	const stats = transcriptStats(turns)
	const open = env.snapshot.inbox.filter((i) => !i.resolvedAt)
	const hours = env.snapshot.timeLogs.reduce(
		(acc, t) => {
			acc[t.category] = (acc[t.category] ?? 0) + hoursBetween(t.startedAt, t.endedAt)
			return acc
		},
		{} as Record<string, number>,
	)
	const today = localDayKey(new Date().toISOString())
	const events = env.snapshot.sources
		.filter((s) => s.kind === "calendar")
		.flatMap((s) => s.events)
		.filter((e) => localDayKey(e.start) === today)
	return [
		focus ? `Focus: ${focus}` : null,
		`Turns: ${stats.turns}. You ${stats.you}. Assistant ${stats.moya}.`,
		`Memories: ${env.snapshot.memories.length}. Boards: ${env.snapshot.boards.length}. Routines: ${env.snapshot.automations.filter((a) => a.enabled).length}.`,
		Object.keys(hours).length
			? `Time logged: ${Object.entries(hours)
					.map(([k, v]) => `${k} ${v.toFixed(1)}h`)
					.join(", ")}.`
			: "No time logs yet.",
		open.length ? `Open loops: ${open.map((i) => `${i.title} (${i.id})`).join("; ")}.` : "No open loops.",
		events.length
			? `On the calendar today: ${events.map((e) => e.title).join("; ")}.`
			: env.snapshot.sources.some((s) => s.kind === "calendar")
				? "Calendar source is connected; nothing on today."
				: "No calendar source.",
	]
		.filter(Boolean)
		.join("\n")
}

export function actLived(ctx: ActCtx): ActResult | null {
	const { command, env, next, args } = ctx
	const snap = next.snapshot

	if (command === "memory.write") {
		const text = str(args, "text").trim()
		if (!text) return fail(command, "Empty memory ignored.", env)
		const kind = (str(args, "kind") as MemoryKind) || "fact"
		const existing = snap.memories.find((m) => m.text.toLowerCase() === text.toLowerCase())
		if (existing) {
			snap.memories = snap.memories.map((m) =>
				m.id === existing.id
					? {
							...m,
							weight: m.weight + 1,
							lastUsedAt: nowIso(),
							kind,
							pinned: bool(args, "pinned") === true ? true : m.pinned,
						}
					: m,
			)
			return ok(command, `Reinforced (${kind}): ${text}`, next, { id: existing.id })
		}
		const mem: Memory = {
			id: uid("mem"),
			kind,
			text,
			weight: 1,
			pinned: Boolean(args.pinned),
			createdAt: nowIso(),
			lastUsedAt: nowIso(),
		}
		snap.memories = [mem, ...snap.memories].slice(0, 240)
		return ok(command, `Remembered (${mem.kind}): ${mem.text}`, next, { id: mem.id })
	}

	if (command === "memory.update") {
		const id = str(args, "id")
		if (!id) return fail(command, "Memory id required.", env)
		const found = snap.memories.find((m) => m.id === id)
		if (!found) return fail(command, "Memory not found.", env)
		snap.memories = snap.memories.map((m) =>
			m.id === id
				? {
						...m,
						text: str(args, "text", m.text) || m.text,
						kind: (str(args, "kind") as MemoryKind) || m.kind,
						pinned: bool(args, "pinned") ?? m.pinned,
						lastUsedAt: nowIso(),
					}
				: m,
		)
		return ok(command, `Updated memory ${id}.`, next, { id })
	}

	if (command === "memory.forget") {
		const id = str(args, "id")
		if (!id) return fail(command, "Memory id required. Query first.", env)
		const before = snap.memories.length
		snap.memories = snap.memories.filter((m) => m.id !== id)
		if (snap.memories.length === before) return fail(command, "Memory not found.", env)
		return ok(command, `Forgot memory ${id}.`, next, { id })
	}

	if (command === "inbox.add") {
		const item: InboxItem = {
			id: uid("in"),
			title: str(args, "title", "Needs you"),
			body: str(args, "body"),
			source: str(args, "source", "moya"),
			severity: (str(args, "severity") as InboxSeverity) || "need",
			createdAt: nowIso(),
			resolvedAt: null,
		}
		snap.inbox = [item, ...snap.inbox]
		return ok(command, `Queued: ${item.title}`, next, { id: item.id })
	}

	if (command === "inbox.resolve") {
		const id = str(args, "id")
		if (!id) return fail(command, "Inbox id required. Query first.", env)
		const item = snap.inbox.find((i) => i.id === id)
		if (!item) return fail(command, "Inbox item not found.", env)
		snap.inbox = snap.inbox.map((i) => (i.id === id ? { ...i, resolvedAt: nowIso() } : i))
		return ok(command, `Resolved: ${item.title}`, next, { id })
	}

	if (command === "board.upsert") {
		const items = Array.isArray(args.items)
			? (args.items as Array<Record<string, unknown>>).map((it) => ({
					id: String(it.id ?? uid("bi")),
					label: String(it.label ?? "Item"),
					state: (it.state as BoardItemState) || "watching",
					note: String(it.note ?? ""),
					needsInput: Boolean(it.needsInput),
				}))
			: []
		const id = str(args, "id")
		const existing = id ? snap.boards.find((b) => b.id === id) : undefined
		if (existing) {
			snap.boards = snap.boards.map((b) =>
				b.id === existing.id
					? {
							...b,
							name: str(args, "name", b.name) || b.name,
							summary: args.summary != null ? str(args, "summary") : b.summary,
							items: items.length ? items : b.items,
							updatedAt: nowIso(),
						}
					: b,
			)
			return ok(command, `Updated board ${existing.name}`, next, { id: existing.id })
		}
		const board: Board = {
			id: id || uid("board"),
			name: str(args, "name", "Board"),
			summary: str(args, "summary"),
			items,
			updatedAt: nowIso(),
		}
		snap.boards = [board, ...snap.boards]
		return ok(command, `Created board ${board.name}`, next, { id: board.id })
	}

	if (command === "board.delete") {
		const id = str(args, "id")
		if (!id) return fail(command, "Board id required.", env)
		const found = snap.boards.find((b) => b.id === id)
		if (!found) return fail(command, "Board not found.", env)
		snap.boards = snap.boards.filter((b) => b.id !== id)
		return ok(command, `Deleted board ${found.name}.`, next, { id })
	}

	if (command === "time.log") {
		const hours = Number(args.hours ?? 0)
		const ended = new Date()
		const started = new Date(ended.getTime() - hours * 3_600_000)
		const log: TimeLog = {
			id: uid("t"),
			startedAt: started.toISOString(),
			endedAt: ended.toISOString(),
			category: str(args, "category", "work"),
			note: str(args, "note"),
		}
		snap.timeLogs = [log, ...snap.timeLogs]
		return ok(command, `Logged ${hours}h under ${log.category}.`, next, { id: log.id })
	}

	if (command === "lived.analyze") {
		const body = analyzeBody(next, str(args, "focus"))
		const insight = { id: uid("ins"), title: "Local counts", body, createdAt: nowIso() }
		snap.insights = [insight, ...snap.insights]
		next.ui.dialog = "watch"
		next.ui.watchTab = "time"
		next.ui.artifact = null
		return ok(command, "Opened Watch → Time with local counts.", next, { id: insight.id, body })
	}

	return null
}
