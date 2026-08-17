import { describeRoutines } from "./automations"
import { displayName } from "./brand"
import { executeBuiltin, type World } from "./tools"
import type { Snapshot } from "./types"

export function buildSystemPrompt(snap: Snapshot, extra = ""): string {
	const name = displayName(snap.settings.agentName)
	const user = snap.settings.userName || "the human"
	const brief = snap.settings.brief.trim()
	const memories = snap.memories
		.slice()
		.sort(
			(a, b) => Number(b.pinned) - Number(a.pinned) || b.weight - a.weight || b.lastUsedAt.localeCompare(a.lastUsedAt),
		)
		.slice(0, 22)
		.map((m) => `- ${m.pinned ? "★ " : ""}[${m.kind}] ${m.text}`)
		.join("\n")
	const inbox = snap.inbox
		.filter((i) => !i.resolvedAt)
		.slice(0, 8)
		.map((i) => `- (${i.severity}) ${i.title}: ${i.body}`)
		.join("\n")
	const boards = snap.boards
		.slice(0, 6)
		.map((b) => {
			const items = (b.items ?? [])
				.map((it) => `  · ${it.label} [${it.state}]${it.needsInput ? " NEEDS YOU" : ""} ${it.note}`)
				.join("\n")
			return `- ${b.name}: ${b.summary}\n${items}`
		})
		.join("\n")
	const hours = snap.timeLogs
		.slice(0, 12)
		.map((t) => {
			const h = (new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime()) / 3_600_000
			return `- ${h.toFixed(1)}h ${t.category}${t.note ? ` — ${t.note}` : ""}`
		})
		.join("\n")

	return [
		`You are ${name}, a single personal assistant. You are one mind. You do not spawn other agents, swarms, or personas. If work needs a tool, you call that tool.`,
		`You speak to ${user}. Keep spoken replies to 1–3 short sentences. Put detail in tools (show_visual, boards, inbox, memory_write), not in a monologue.`,
		`Data is local-first. Remember via memory_write. Forget via memory_forget. Loop ${user} in via inbox_add AND by speaking. Organize via boards. Log time when they mention how they spent it. Create routines via automation_upsert.`,
		`When something should be true later, write a memory. When something should happen later without being asked, write a routine.`,
		`You do not pretend to be inside their other machines. Their projects expose capability through MCP tools. If a tool is missing, say so — that is a gap in that project, not something you invent.`,
		`When they bounce ideas, think with them. Be direct. No cheerleading. No emoji.`,
		`When you need to show something, call show_visual with a status, chart, diagram, brief, or note. A diagram must include nodes [{id, label}] and edges [{from, to}].`,
		`Start the first spoken sentence as if continuing a working relationship, not introducing a product.`,
		brief ? `Standing brief from ${user}: ${brief}` : null,
		memories ? `Memories:\n${memories}` : "No durable memories yet.",
		inbox ? `Open loops:\n${inbox}` : "Inbox is clear.",
		boards ? `Boards:\n${boards}` : "No boards yet.",
		hours ? `Recent time:\n${hours}` : "No time logs yet.",
		`Routines:\n${describeRoutines(snap)}`,
		extra || null,
		`After using tools, give a spoken wrap-up. If you opened a visual, mention that you put it up.`,
	]
		.filter(Boolean)
		.join("\n\n")
}

export function applyLocalIntent(userText: string, world: World): { spoken: string } {
	const q = userText.trim()
	const lower = q.toLowerCase()

	const remember = q.match(/remember(?:\s+that)?\s+(.+)/i)
	if (remember?.[1]) {
		executeBuiltin("memory_write", JSON.stringify({ kind: "preference", text: remember[1].trim() }), world)
		return { spoken: `Kept. ${remember[1].trim()}` }
	}

	const forget = q.match(/forget(?:\s+that)?\s+(.+)/i)
	if (forget?.[1]) {
		executeBuiltin("memory_forget", JSON.stringify({ text: forget[1].trim() }), world)
		return { spoken: "Forgotten, if I had it." }
	}

	const hours = q.match(/log\s+(\d+(?:\.\d+)?)\s*(h|hr|hour|hours)\s*(?:on|of|to)?\s*(.*)/i)
	if (hours) {
		executeBuiltin(
			"time_log",
			JSON.stringify({ hours: Number(hours[1]), category: hours[3]?.trim() || "work", note: q }),
			world,
		)
		return { spoken: `Logged ${hours[1]} hours${hours[3] ? ` on ${hours[3].trim()}` : ""}.` }
	}

	if (/analyze|insight|pattern|how am i spending|where does my time/.test(lower)) {
		executeBuiltin("analyze_history", JSON.stringify({ focus: q }), world)
		return { spoken: "I put a brief up from the local transcript." }
	}

	if (/needs? me|loop me in|don't let me forget|remind me/.test(lower)) {
		const title = q.replace(/^.*?(?:remind me to|loop me in(?: on)?|don't let me forget)\s+/i, "").slice(0, 80)
		executeBuiltin("inbox_add", JSON.stringify({ title: title || "Needs you", body: q, severity: "need" }), world)
		return { spoken: "Queued. It will sit in Watch until you clear it." }
	}

	if (/watch\s+(.+)/i.test(q) && !/watchboard|watching/.test(lower)) {
		const name = q.match(/watch\s+(.+)/i)?.[1]?.trim()
		if (name) {
			executeBuiltin("board_upsert", JSON.stringify({ name, summary: `Watching ${name}.`, items: [] }), world)
			return { spoken: `I started a board for ${name}.` }
		}
	}

	const every = q.match(/every\s+(\d+)\s*(min|mins|minutes|hour|hours)\s+(.+)/i)
	if (every) {
		const n = Number(every[1])
		const unit = every[2].startsWith("hour") ? n * 60 : n
		executeBuiltin(
			"automation_upsert",
			JSON.stringify({
				name: every[3].slice(0, 40),
				brief: every[3],
				triggerType: "interval",
				everyMinutes: unit,
			}),
			world,
		)
		return { spoken: `Routine set. Every ${every[1]} ${every[2]} I will: ${every[3]}` }
	}

	return { spoken: localFallback(q, world.snapshot) }
}

export function localFallback(userText: string, snap: Snapshot): string {
	const q = userText.toLowerCase()
	const open = snap.inbox.filter((i) => !i.resolvedAt)
	if (/what do you remember|memories|memory/.test(q)) {
		if (!snap.memories.length) return "Nothing durable yet. Tell me to remember something, or add it in Memory."
		const top = snap.memories.slice(0, 3).map((m) => m.text)
		return `I am holding ${snap.memories.length}. ${top.join(" ")}`
	}
	if (/routine|automat/.test(q)) {
		const n = snap.automations.filter((a) => a.enabled).length
		return n
			? `${n} routine${n === 1 ? "" : "s"} running. Open Routines to see them.`
			: "No routines yet. Open Routines, or say something like: every 60 minutes scan the boards."
	}
	if (/analyze|insight|pattern|how am i|time/.test(q)) {
		return open.length
			? `I can work from what is already here. ${open.length} open loop${open.length === 1 ? "" : "s"} waiting. Ask me to analyze the transcript and I will put the brief up.`
			: "I can work from the local transcript and time logs. Ask me to analyze and I will put a brief up."
	}
	if (/remember|don't forget|do not forget/.test(q)) {
		return "I will keep that. Say it once more as a clean sentence if you want it stored verbatim."
	}
	if (/board|project|status|watch/.test(q)) {
		return snap.boards[0]
			? `${snap.boards[0].name} is on the board. Open Watch if you want the full picture.`
			: "No boards yet. Tell me what to watch and I will start one."
	}
	if (/hello|hey|hi |good morning|good evening/.test(q)) {
		return `Here. Hold the core to talk, or type if you would rather.`
	}
	return "The model is not connected, so I am running on local memory only. I can still remember, log time, keep boards, and queue things that need you. Add a provider in Settings when you want a full mind."
}
