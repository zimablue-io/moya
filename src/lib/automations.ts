import { executeBuiltin, type World } from "./tools"
import type { Automation, AutomationTrigger, Snapshot } from "./types"
import { nowIso, uid } from "./utils"

export type AutomationDraft = {
	name: string
	brief: string
	trigger: AutomationTrigger
	enabled?: boolean
}

export const AUTOMATION_PRESETS: AutomationDraft[] = [
	{
		name: "Morning brief",
		brief:
			"Review boards, inbox, and recent time. Put a brief up. If anything is blocked or needs the human, add it to the inbox.",
		trigger: { type: "daily", hour: 8, minute: 0 },
		enabled: true,
	},
	{
		name: "Watch loop",
		brief: "Scan boards. If something is blocked or needs the human, add an inbox item. Stay quiet if nothing changed.",
		trigger: { type: "interval", everyMinutes: 60 },
		enabled: true,
	},
	{
		name: "Evening capture",
		brief:
			"From today's transcript, write durable memories for decisions, preferences, and open loops. Do not duplicate what is already remembered.",
		trigger: { type: "daily", hour: 18, minute: 30 },
		enabled: true,
	},
	{
		name: "When I say remember",
		brief: "Write a durable memory from what was just said. Prefer kind=decision or preference when it fits.",
		trigger: { type: "phrase", pattern: "remember" },
		enabled: true,
	},
]

export function makeAutomation(draft: AutomationDraft): Automation {
	return {
		id: uid("auto"),
		name: draft.name.trim() || "Routine",
		brief: draft.brief.trim(),
		enabled: draft.enabled ?? true,
		trigger: draft.trigger,
		lastRunAt: draft.trigger.type === "daily" || draft.trigger.type === "interval" ? nowIso() : null,
		lastResult: "",
		createdAt: nowIso(),
	}
}

export function formatTrigger(t: AutomationTrigger): string {
	if (t.type === "manual") return "Manual"
	if (t.type === "interval") {
		if (t.everyMinutes % 60 === 0) {
			const h = t.everyMinutes / 60
			return h === 1 ? "Every hour" : `Every ${h} hours`
		}
		return `Every ${t.everyMinutes} min`
	}
	if (t.type === "daily") {
		const hh = String(t.hour).padStart(2, "0")
		const mm = String(t.minute).padStart(2, "0")
		return `Daily ${hh}:${mm}`
	}
	return `When you say “${t.pattern}”`
}

export function isDue(auto: Automation, now = Date.now()): boolean {
	if (!auto.enabled) return false
	if (auto.trigger.type === "manual" || auto.trigger.type === "phrase") return false
	if (auto.trigger.type === "interval") {
		const last = auto.lastRunAt ? new Date(auto.lastRunAt).getTime() : 0
		return now - last >= auto.trigger.everyMinutes * 60_000
	}
	const d = new Date(now)
	const pastSlot =
		d.getHours() > auto.trigger.hour || (d.getHours() === auto.trigger.hour && d.getMinutes() >= auto.trigger.minute)
	if (!pastSlot) return false
	if (!auto.lastRunAt) return true
	return new Date(auto.lastRunAt).toDateString() !== d.toDateString()
}

export function matchPhraseAutomations(autos: Automation[], text: string): Automation[] {
	const q = text.toLowerCase()
	return autos.filter((a) => {
		if (!a.enabled || a.trigger.type !== "phrase") return false
		const p = a.trigger.pattern.trim().toLowerCase()
		return p.length > 0 && q.includes(p)
	})
}

export function quietReply(text: string): boolean {
	return /^(ok|okay|done|quiet|nothing|all clear|noted)[.!]?$/i.test(text.trim())
}

export function runLocalAutomation(auto: Automation, world: World): string {
	const brief = auto.brief.toLowerCase()
	const snap = world.snapshot
	const parts: string[] = []

	if (/analy|brief|review|summar|evening|morning/.test(brief)) {
		executeBuiltin("analyze_history", JSON.stringify({ focus: auto.name }), world)
		parts.push("Put a brief up.")
	}

	if (/inbox|loop|need|blocked|watch/.test(brief)) {
		const blocked = snap.boards.flatMap((b) =>
			b.items.filter((it) => it.needsInput || it.state === "blocked").map((it) => `${b.name}: ${it.label}`),
		)
		if (blocked.length) {
			executeBuiltin(
				"inbox_add",
				JSON.stringify({
					title: `${auto.name}: needs you`,
					body: blocked.join("; "),
					severity: "need",
					source: auto.name,
				}),
				world,
			)
			parts.push(`${blocked.length} item${blocked.length === 1 ? "" : "s"} need you.`)
		}
	}

	if (/remember|memor|decision|preference/.test(brief)) {
		const recent = snap.messages.filter((m) => m.role === "user").slice(-4)
		if (recent[0]) {
			executeBuiltin(
				"memory_write",
				JSON.stringify({
					kind: "insight",
					text: `From ${auto.name}: ${recent
						.map((m) => m.content)
						.join(" / ")
						.slice(0, 280)}`,
				}),
				world,
			)
			parts.push("Kept a note from recent talk.")
		}
	}

	return parts.join(" ") || "Nothing to do."
}

export function describeRoutines(snap: Snapshot): string {
	const live = snap.automations.filter((a) => a.enabled)
	if (!live.length) return "No routines enabled."
	return live.map((a) => `- ${a.name} (${formatTrigger(a.trigger)}): ${a.brief}`).join("\n")
}
