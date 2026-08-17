import { localDayKey, transcriptStats } from "../transcript.ts"
import type { Source } from "../types.ts"
import { hoursBetween } from "../utils.ts"
import type { EnvState, QueryArgs, Receipt } from "./types.ts"

function needle(q?: string) {
	return (q ?? "").trim().toLowerCase()
}

function matchText(q: string, ...parts: string[]) {
	if (!q) return true
	return parts.some((p) => p.toLowerCase().includes(q))
}

function sourceCard(s: Source) {
	return {
		id: s.id,
		kind: s.kind,
		name: s.name,
		mode: s.mode,
		origin: s.origin,
		files: s.files.length,
		events: s.events.length,
		work: s.work.length,
		lastSyncAt: s.lastSyncAt,
	}
}

export function runQuery(env: EnvState, args: QueryArgs = {}): { data: unknown; receipt: Receipt } {
	const domain = args.domain ?? "all"
	const q = needle(args.q)
	const snap = env.snapshot
	const lived = {
		identity: {
			agentName: snap.settings.agentName,
			userName: snap.settings.userName,
			brief: snap.settings.brief,
		},
		counts: {
			memories: snap.memories.length,
			inboxOpen: snap.inbox.filter((i) => !i.resolvedAt).length,
			inboxResolved: snap.inbox.filter((i) => i.resolvedAt).length,
			boards: snap.boards.length,
			timeLogs: snap.timeLogs.length,
			insights: snap.insights.length,
			routines: snap.automations.length,
			mcp: snap.mcpServers.length,
			sources: snap.sources.length,
			turns: snap.messages.filter((m) => !m.hidden && m.role !== "tool").length,
		},
		memories: snap.memories
			.filter((m) => matchText(q, m.text, m.kind, m.id))
			.map((m) => ({
				id: m.id,
				kind: m.kind,
				text: m.text,
				pinned: m.pinned,
				weight: m.weight,
				lastUsedAt: m.lastUsedAt,
			})),
		inbox: snap.inbox
			.filter((i) => matchText(q, i.title, i.body, i.id, i.source))
			.map((i) => ({
				id: i.id,
				title: i.title,
				body: i.body,
				severity: i.severity,
				source: i.source,
				resolvedAt: i.resolvedAt,
			})),
		boards: snap.boards
			.filter((b) => matchText(q, b.name, b.summary, b.id, ...(b.items ?? []).map((it) => it.label)))
			.map((b) => ({
				id: b.id,
				name: b.name,
				summary: b.summary,
				items: (b.items ?? []).map((it) => ({
					id: it.id,
					label: it.label,
					state: it.state,
					needsInput: it.needsInput,
					note: it.note,
				})),
			})),
		timeLogs: snap.timeLogs
			.filter((t) => matchText(q, t.category, t.note, t.id))
			.map((t) => ({
				id: t.id,
				hours: hoursBetween(t.startedAt, t.endedAt),
				category: t.category,
				note: t.note,
				startedAt: t.startedAt,
			})),
		insights: snap.insights
			.filter((i) => matchText(q, i.title, i.body, i.id))
			.map((i) => ({ id: i.id, title: i.title, body: i.body, createdAt: i.createdAt })),
		routines: snap.automations
			.filter((a) => matchText(q, a.name, a.brief, a.id))
			.map((a) => ({
				id: a.id,
				name: a.name,
				brief: a.brief,
				enabled: a.enabled,
				trigger: a.trigger,
				lastRunAt: a.lastRunAt,
				lastResult: a.lastResult,
			})),
		mcp: snap.mcpServers
			.filter((s) => matchText(q, s.name, s.url, s.id))
			.map((s) => ({
				id: s.id,
				name: s.name,
				url: s.url,
				enabled: s.enabled,
				tools: (s.tools ?? []).map((t) => t.name),
				lastError: s.lastError ?? null,
			})),
	}

	const ui = {
		dialog: env.ui.dialog,
		artifact: env.ui.artifact
			? { type: env.ui.artifact.type, title: env.ui.artifact.title, grounding: env.ui.artifact.grounding ?? null }
			: null,
		composerOpen: env.ui.composerOpen,
		voiceMode: env.ui.voiceMode,
		menuOpen: env.ui.menuOpen,
		settingsTab: env.ui.settingsTab,
		watchTab: env.ui.watchTab,
		historyMode: env.ui.historyMode,
		historyQuery: env.ui.historyQuery,
		historyDay: env.ui.historyDay,
		memoryQuery: env.ui.memoryQuery,
		memoryKind: env.ui.memoryKind,
		routinesFormOpen: env.ui.routinesFormOpen,
		focusField: env.ui.focusField,
	}

	const sources = {
		lived: { kind: "lived", name: "This device", mode: "read" },
		items: snap.sources.filter((s) => matchText(q, s.name, s.kind, s.id, s.origin)).map(sourceCard),
		empty: snap.sources.length === 0,
		hint:
			snap.sources.length === 0
				? "Add a calendar ICS, attach notes, or connect a read-only work tracker in Settings → Sources."
				: null,
	}

	const turns = snap.messages.filter((m) => !m.hidden && m.role !== "tool" && m.role !== "system")
	const dayTurns = args.day ? turns.filter((m) => localDayKey(m.createdAt) === args.day) : turns
	const searched = q ? dayTurns.filter((m) => matchText(q, m.content, m.id)) : dayTurns
	const transcript = {
		stats: transcriptStats(searched),
		day: args.day ?? null,
		sample: searched.slice(-12).map((m) => ({
			id: m.id,
			role: m.role,
			content: m.content.slice(0, 280),
			createdAt: m.createdAt,
		})),
	}

	const today = localDayKey(new Date().toISOString())
	const calSources = snap.sources.filter((s) => s.kind === "calendar" || s.events.length > 0)
	const events = calSources
		.flatMap((s) => s.events.map((e) => ({ ...e, sourceId: s.id, source: s.name })))
		.filter((e) => {
			const day = e.start ? localDayKey(e.start) : ""
			if (args.day && day !== args.day) return false
			return matchText(q, e.title, e.id)
		})
	const calendar = {
		sources: calSources.map(sourceCard),
		events,
		today: events.filter((e) => localDayKey(e.start) === today),
		empty: calSources.length === 0,
		hint:
			calSources.length === 0
				? "No calendar source. Add an ICS feed or file in Settings → Sources."
				: events.length === 0
					? "Calendar is connected but has no matching events."
					: null,
	}

	const workSources = snap.sources.filter((s) => s.kind === "work")
	const items = workSources
		.flatMap((s) => s.work.map((w) => ({ ...w, sourceId: s.id, source: s.name })))
		.filter((w) => matchText(q, w.title, w.state, w.id))
	const work = {
		sources: workSources.map(sourceCard),
		items,
		boards: lived.boards,
		empty: workSources.length === 0 && snap.boards.length === 0,
		hint:
			workSources.length === 0 && snap.boards.length === 0
				? "No work source and no boards. Connect Linear readonly or GitHub read in Settings → Sources, or start a board."
				: null,
	}

	const payload: Record<string, unknown> = {}
	if (domain === "all" || domain === "lived") payload.lived = lived
	if (domain === "all" || domain === "ui") payload.ui = ui
	if (domain === "all" || domain === "sources") payload.sources = sources
	if (domain === "all" || domain === "transcript") payload.transcript = transcript
	if (domain === "all" || domain === "calendar") payload.calendar = calendar
	if (domain === "all" || domain === "work") payload.work = work

	return {
		data: payload,
		receipt: {
			command: "query",
			ok: true,
			summary: `Queried ${domain}.`,
			data: payload,
		},
	}
}
