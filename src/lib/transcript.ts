import { APP_NAME } from "./brand.ts"
import { DAY_FORMAT, formatClock, formatDay } from "./utils.ts"

export type HeatLevel = 0 | 1 | 2 | 3

export type DayStamp = { createdAt: string }

export type TranscriptTurn = DayStamp & {
	role: string
	hidden?: boolean
	content?: string
}

export type TranscriptStats = {
	turns: number
	you: number
	moya: number
	startedAt: string | null
	endedAt: string | null
}

export function isTranscriptTurn(m: { hidden?: boolean; role: string }): boolean {
	return !m.hidden && m.role !== "tool" && m.role !== "system"
}

export function localDayKey(iso: string): string {
	return localDayKeyFromDate(new Date(iso))
}

export function localDayKeyFromDate(d: Date): string {
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, "0")
	const day = String(d.getDate()).padStart(2, "0")
	return `${y}-${m}-${day}`
}

export function dateFromLocalDayKey(key: string): Date {
	const [y, m, d] = key.split("-").map(Number)
	return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function formatLocalDayKey(key: string): string {
	return dateFromLocalDayKey(key).toLocaleDateString(undefined, DAY_FORMAT)
}

export function activityByDay(messages: DayStamp[]): Map<string, number> {
	const map = new Map<string, number>()
	for (const m of messages) {
		const key = localDayKey(m.createdAt)
		map.set(key, (map.get(key) ?? 0) + 1)
	}
	return map
}

export function heatLevel(count: number, max: number): HeatLevel {
	if (count <= 0 || max <= 0) return 0
	const ratio = count / max
	if (ratio <= 1 / 3) return 1
	if (ratio <= 2 / 3) return 2
	return 3
}

export function heatDatesByLevel(activity: Map<string, number>): {
	heat1: Date[]
	heat2: Date[]
	heat3: Date[]
} {
	const max = Math.max(0, ...activity.values())
	const heat1: Date[] = []
	const heat2: Date[] = []
	const heat3: Date[] = []
	for (const [key, count] of activity) {
		const level = heatLevel(count, max)
		const date = dateFromLocalDayKey(key)
		if (level === 1) heat1.push(date)
		else if (level === 2) heat2.push(date)
		else if (level === 3) heat3.push(date)
	}
	return { heat1, heat2, heat3 }
}

export function filterByDay<T extends DayStamp>(messages: T[], dayKey: string | null): T[] {
	if (!dayKey) return messages
	return messages.filter((m) => localDayKey(m.createdAt) === dayKey)
}

export function transcriptStats(messages: TranscriptTurn[]): TranscriptStats {
	let you = 0
	let moya = 0
	for (const m of messages) {
		if (m.role === "user") you += 1
		else if (m.role === "assistant") moya += 1
	}
	return {
		turns: messages.length,
		you,
		moya,
		startedAt: messages[0]?.createdAt ?? null,
		endedAt: messages[messages.length - 1]?.createdAt ?? null,
	}
}

export function formatSpan(startedAt: string, endedAt: string): string {
	const a = new Date(startedAt)
	const b = new Date(endedAt)
	if (localDayKey(startedAt) === localDayKey(endedAt)) {
		return `${formatClock(a)} – ${formatClock(b)}`
	}
	return `${formatDay(startedAt)} – ${formatDay(endedAt)}`
}

export function formatTranscriptStats(stats: TranscriptStats): string {
	const noun = stats.turns === 1 ? "turn" : "turns"
	const parts = [`${stats.turns} ${noun}`, `You ${stats.you}`, `${APP_NAME} ${stats.moya}`]
	if (stats.startedAt && stats.endedAt && stats.turns > 1) {
		parts.push(formatSpan(stats.startedAt, stats.endedAt))
	}
	return parts.join(" · ")
}

export function previewSnippet(content: string, max = 80): string {
	const collapsed = content.replace(/\s+/g, " ").trim()
	if (collapsed.length <= max) return collapsed
	return `${collapsed.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export function tickIndexAtY(y: number, height: number, count: number): number {
	if (count <= 1 || height <= 0) return 0
	const t = Math.max(0, Math.min(1, y / height))
	return Math.round(t * (count - 1))
}

export function tickY(index: number, count: number, height: number): number {
	if (count <= 1) return height / 2
	return (index / (count - 1)) * height
}

export function visibleTickIndices(count: number, height: number, minGap = 4): number[] {
	if (count <= 0) return []
	if (count === 1) return [0]
	const maxTicks = Math.max(2, Math.floor(height / minGap) + 1)
	if (count <= maxTicks) return Array.from({ length: count }, (_, i) => i)
	const out: number[] = []
	for (let i = 0; i < maxTicks; i += 1) {
		out.push(Math.round((i / (maxTicks - 1)) * (count - 1)))
	}
	return [...new Set(out)]
}
