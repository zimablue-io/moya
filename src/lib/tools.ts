import {
	type Artifact,
	type Automation,
	type AutomationTrigger,
	type Board,
	type BoardItemState,
	type InboxItem,
	type InboxSeverity,
	type Memory,
	type MemoryKind,
	normalizeArtifact,
	type Snapshot,
	type TimeLog,
} from "./types"
import { nowIso, uid } from "./utils"

export type ToolCall = { id: string; name: string; arguments: string }
export type ToolResult = { id: string; name: string; content: string; artifact?: Artifact }

export type World = {
	snapshot: Snapshot
	opened?: Artifact
}

export const BUILTIN_TOOLS = [
	{
		name: "memory_write",
		description: "Store or reinforce a durable memory about the user, a decision, a preference, or a project.",
		inputSchema: {
			type: "object",
			properties: {
				kind: { type: "string", enum: ["fact", "preference", "decision", "project", "insight"] },
				text: { type: "string" },
				pinned: { type: "boolean" },
			},
			required: ["kind", "text"],
		},
	},
	{
		name: "memory_search",
		description: "Search local memories by keywords.",
		inputSchema: {
			type: "object",
			properties: { query: { type: "string" } },
			required: ["query"],
		},
	},
	{
		name: "memory_forget",
		description: "Forget a memory by id, or by a unique substring of its text.",
		inputSchema: {
			type: "object",
			properties: { id: { type: "string" }, text: { type: "string" } },
		},
	},
	{
		name: "inbox_add",
		description: "Loop the human in. Create a needs-you item they must see later.",
		inputSchema: {
			type: "object",
			properties: {
				title: { type: "string" },
				body: { type: "string" },
				severity: { type: "string", enum: ["info", "need", "urgent"] },
				source: { type: "string" },
			},
			required: ["title", "body"],
		},
	},
	{
		name: "inbox_resolve",
		description: "Mark a needs-you item as resolved.",
		inputSchema: {
			type: "object",
			properties: { id: { type: "string" } },
			required: ["id"],
		},
	},
	{
		name: "board_upsert",
		description: "Create or update a watch board for any project. Use this instead of inventing live system state.",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
				name: { type: "string" },
				summary: { type: "string" },
				items: {
					type: "array",
					items: {
						type: "object",
						properties: {
							id: { type: "string" },
							label: { type: "string" },
							state: { type: "string", enum: ["watching", "running", "blocked", "idle", "done"] },
							note: { type: "string" },
							needsInput: { type: "boolean" },
						},
						required: ["label"],
					},
				},
			},
			required: ["name"],
		},
	},
	{
		name: "time_log",
		description: "Log time the human spent on something.",
		inputSchema: {
			type: "object",
			properties: {
				hours: { type: "number" },
				category: { type: "string" },
				note: { type: "string" },
			},
			required: ["hours", "category"],
		},
	},
	{
		name: "show_visual",
		description: "Show a visual: status grid, chart, diagram, or written brief. Use when words are not enough.",
		inputSchema: {
			type: "object",
			properties: {
				artifact: {
					type: "object",
					properties: {
						type: { type: "string", enum: ["status", "chart", "diagram", "brief", "note"] },
						title: { type: "string" },
						items: {
							type: "array",
							items: {
								type: "object",
								properties: {
									label: { type: "string" },
									value: { type: "string" },
									tone: { type: "string", enum: ["ok", "warn", "alert", "neutral"] },
								},
								required: ["label", "value"],
							},
						},
						series: {
							type: "array",
							items: {
								type: "object",
								properties: {
									name: { type: "string" },
									points: {
										type: "array",
										items: {
											type: "object",
											properties: { x: { type: "string" }, y: { type: "number" } },
											required: ["x", "y"],
										},
									},
								},
								required: ["name", "points"],
							},
						},
						nodes: {
							type: "array",
							items: {
								type: "object",
								properties: { id: { type: "string" }, label: { type: "string" } },
								required: ["id", "label"],
							},
						},
						edges: {
							type: "array",
							items: {
								type: "object",
								properties: {
									from: { type: "string" },
									to: { type: "string" },
									label: { type: "string" },
								},
								required: ["from", "to"],
							},
						},
						body: { type: "string" },
					},
					required: ["type", "title"],
				},
			},
			required: ["artifact"],
		},
	},
	{
		name: "analyze_history",
		description: "Summarize local transcripts into themes, decisions, and open loops. Call when asked to analyze.",
		inputSchema: {
			type: "object",
			properties: { focus: { type: "string" } },
		},
	},
	{
		name: "automation_upsert",
		description:
			"Create or update a local routine. Triggers: manual, interval (minutes), daily (hour, minute), or phrase.",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
				name: { type: "string" },
				brief: { type: "string" },
				enabled: { type: "boolean" },
				triggerType: { type: "string", enum: ["manual", "interval", "daily", "phrase"] },
				everyMinutes: { type: "number" },
				hour: { type: "number" },
				minute: { type: "number" },
				pattern: { type: "string" },
			},
			required: ["name", "brief"],
		},
	},
] as const

export function executeBuiltin(name: string, raw: string, world: World): ToolResult {
	let args: Record<string, unknown> = {}
	try {
		args = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
	} catch {
		args = { text: raw }
	}
	const s = world.snapshot

	if (name === "memory_write") {
		const text = String(args.text ?? "").trim()
		if (!text) return { id: "", name, content: "Empty memory ignored." }
		const kind = (args.kind as MemoryKind) || "fact"
		const existing = s.memories.find((m) => m.text.toLowerCase() === text.toLowerCase())
		if (existing) {
			existing.weight += 1
			existing.lastUsedAt = nowIso()
			existing.kind = kind
			if (args.pinned === true) existing.pinned = true
			return { id: "", name, content: `Reinforced (${existing.kind}): ${existing.text}` }
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
		s.memories.unshift(mem)
		s.memories = s.memories.slice(0, 240)
		return { id: "", name, content: `Remembered (${mem.kind}): ${mem.text}` }
	}

	if (name === "memory_search") {
		const q = String(args.query ?? "").toLowerCase()
		const hits = s.memories
			.filter((m) => !q || m.text.toLowerCase().includes(q) || m.kind.includes(q))
			.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.weight - a.weight)
			.slice(0, 10)
		hits.forEach((m) => {
			m.lastUsedAt = nowIso()
		})
		return {
			id: "",
			name,
			content: hits.length
				? hits.map((m) => `- ${m.pinned ? "★ " : ""}[${m.kind}] ${m.text}`).join("\n")
				: "No matching memories.",
		}
	}

	if (name === "memory_forget") {
		const id = String(args.id ?? "")
		const needle = String(args.text ?? "").toLowerCase()
		const before = s.memories.length
		s.memories = s.memories.filter((m) => {
			if (id && m.id === id) return false
			if (needle && m.text.toLowerCase().includes(needle)) return false
			return true
		})
		const n = before - s.memories.length
		return {
			id: "",
			name,
			content: n ? `Forgot ${n} memor${n === 1 ? "y" : "ies"}.` : "No matching memory.",
		}
	}

	if (name === "inbox_add") {
		const item: InboxItem = {
			id: uid("in"),
			title: String(args.title ?? "Needs you"),
			body: String(args.body ?? ""),
			source: String(args.source ?? "moya"),
			severity: (args.severity as InboxSeverity) || "need",
			createdAt: nowIso(),
			resolvedAt: null,
		}
		s.inbox.unshift(item)
		return { id: "", name, content: `Queued: ${item.title}` }
	}

	if (name === "inbox_resolve") {
		const id = String(args.id ?? "")
		const item = s.inbox.find((i) => i.id === id)
		if (!item) return { id: "", name, content: "Inbox item not found." }
		item.resolvedAt = nowIso()
		return { id: "", name, content: `Resolved: ${item.title}` }
	}

	if (name === "board_upsert") {
		const id = String(args.id ?? uid("board"))
		const items = Array.isArray(args.items)
			? (args.items as Array<Record<string, unknown>>).map((it) => ({
					id: String(it.id ?? uid("bi")),
					label: String(it.label ?? "Item"),
					state: (it.state as BoardItemState) || "watching",
					note: String(it.note ?? ""),
					needsInput: Boolean(it.needsInput),
				}))
			: []
		const existing = s.boards.find((b) => b.id === id || b.name === args.name)
		if (existing) {
			existing.name = String(args.name ?? existing.name)
			existing.summary = String(args.summary ?? existing.summary)
			if (items.length) existing.items = items
			existing.updatedAt = nowIso()
			return { id: "", name, content: `Updated board ${existing.name}` }
		}
		const board: Board = {
			id,
			name: String(args.name ?? "Board"),
			summary: String(args.summary ?? ""),
			items,
			updatedAt: nowIso(),
		}
		s.boards.unshift(board)
		return { id: "", name, content: `Created board ${board.name}` }
	}

	if (name === "time_log") {
		const hours = Number(args.hours ?? 0)
		const ended = new Date()
		const started = new Date(ended.getTime() - hours * 3_600_000)
		const log: TimeLog = {
			id: uid("t"),
			startedAt: started.toISOString(),
			endedAt: ended.toISOString(),
			category: String(args.category ?? "work"),
			note: String(args.note ?? ""),
		}
		s.timeLogs.unshift(log)
		return { id: "", name, content: `Logged ${hours}h under ${log.category}.` }
	}

	if (name === "show_visual") {
		const artifact = normalizeArtifact(args.artifact ?? (args.type ? args : undefined))
		if (!artifact) return { id: "", name, content: "No artifact provided." }
		world.opened = artifact
		return {
			id: "",
			name,
			content: `Showing ${artifact.type}: ${artifact.title}`,
			artifact,
		}
	}

	if (name === "analyze_history") {
		const focus = String(args.focus ?? "")
		const users = s.messages.filter((m) => m.role === "user").slice(-40)
		const themes = tally(users.map((m) => m.content))
		const open = s.inbox.filter((i) => !i.resolvedAt)
		const hours = s.timeLogs.reduce(
			(acc, t) => {
				acc[t.category] =
					(acc[t.category] ?? 0) + (new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime()) / 3_600_000
				return acc
			},
			{} as Record<string, number>,
		)
		const body = [
			focus ? `Focus: ${focus}` : null,
			`Turns: ${s.messages.length}. Memories: ${s.memories.length}. Routines: ${s.automations.filter((a) => a.enabled).length}.`,
			themes.length ? `Recurring: ${themes.join(", ")}.` : "Not enough transcript yet to see themes.",
			Object.keys(hours).length
				? `Time logged: ${Object.entries(hours)
						.map(([k, v]) => `${k} ${v.toFixed(1)}h`)
						.join(", ")}.`
				: "No time logs yet.",
			open.length ? `Open loops: ${open.map((i) => i.title).join("; ")}.` : "No open loops.",
		]
			.filter(Boolean)
			.join("\n")
		const artifact: Artifact = { type: "brief", title: "Session analysis", body }
		world.opened = artifact
		s.insights.unshift({ id: uid("ins"), title: "Session analysis", body, createdAt: nowIso() })
		return { id: "", name, content: body, artifact }
	}

	if (name === "automation_upsert") {
		const trigger = parseTrigger(args)
		const id = String(args.id ?? "")
		const existing = s.automations.find((a) => a.id === id || a.name === args.name)
		if (existing) {
			existing.name = String(args.name ?? existing.name)
			existing.brief = String(args.brief ?? existing.brief)
			if (typeof args.enabled === "boolean") existing.enabled = args.enabled
			if (trigger) existing.trigger = trigger
			return { id: "", name, content: `Updated routine ${existing.name}` }
		}
		const auto: Automation = {
			id: uid("auto"),
			name: String(args.name ?? "Routine"),
			brief: String(args.brief ?? ""),
			enabled: args.enabled !== false,
			trigger: trigger ?? { type: "manual" },
			lastRunAt: null,
			lastResult: "",
			createdAt: nowIso(),
		}
		s.automations.unshift(auto)
		return { id: "", name, content: `Created routine ${auto.name}` }
	}

	return { id: "", name, content: `Unknown local tool: ${name}` }
}

function parseTrigger(args: Record<string, unknown>): AutomationTrigger | null {
	const t = String(args.triggerType ?? "")
	if (t === "manual") return { type: "manual" }
	if (t === "interval") return { type: "interval", everyMinutes: Math.max(5, Number(args.everyMinutes ?? 60)) }
	if (t === "daily") return { type: "daily", hour: Number(args.hour ?? 9), minute: Number(args.minute ?? 0) }
	if (t === "phrase") return { type: "phrase", pattern: String(args.pattern ?? "").trim() || "remember" }
	return null
}

function tally(texts: string[]): string[] {
	const bag = new Map<string, number>()
	for (const t of texts) {
		for (const w of t.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) {
			if (STOP.has(w)) continue
			bag.set(w, (bag.get(w) ?? 0) + 1)
		}
	}
	return [...bag.entries()]
		.filter(([, n]) => n > 1)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 6)
		.map(([w]) => w)
}

const STOP = new Set([
	"this",
	"that",
	"with",
	"from",
	"have",
	"just",
	"want",
	"need",
	"about",
	"there",
	"what",
	"when",
	"your",
	"they",
	"them",
	"then",
	"than",
	"into",
	"some",
	"more",
	"also",
	"will",
	"would",
	"could",
	"should",
	"make",
	"like",
	"been",
	"were",
	"their",
	"it's",
	"here",
])
