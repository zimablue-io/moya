import type { ArtifactChartPoint, ArtifactEdge, ArtifactNode, ArtifactStatusItem } from "./types.ts"

export function asArray(raw: unknown): unknown[] {
	return Array.isArray(raw) ? raw : []
}

export function asRecord(raw: unknown): Record<string, unknown> | null {
	return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

export function asString(raw: unknown, fallback = ""): string {
	if (typeof raw === "string") return raw
	if (typeof raw === "number" || typeof raw === "boolean") return String(raw)
	return fallback
}

export function parseStatusItems(raw: unknown): ArtifactStatusItem[] {
	if (!Array.isArray(raw)) return []
	return raw.flatMap((item) => {
		const o = asRecord(item)
		if (!o) return []
		const label = asString(o.label)
		const value = asString(o.value)
		if (!label && !value) return []
		const tone = o.tone
		const itemOut: ArtifactStatusItem = { label: label || "Item", value }
		if (tone === "ok" || tone === "warn" || tone === "alert" || tone === "neutral") itemOut.tone = tone
		return [itemOut]
	})
}

export function parseChartSeries(raw: unknown): { name: string; points: ArtifactChartPoint[] }[] {
	if (!Array.isArray(raw)) return []
	return raw.flatMap((series) => {
		const o = asRecord(series)
		if (!o) return []
		const points = Array.isArray(o.points)
			? o.points.flatMap((p) => {
					const pt = asRecord(p)
					if (!pt) return []
					const y = Number(pt.y)
					if (!Number.isFinite(y)) return []
					return [{ x: asString(pt.x), y }]
				})
			: []
		return [{ name: asString(o.name, "Series"), points }]
	})
}

export function parseNodes(raw: unknown): ArtifactNode[] {
	if (Array.isArray(raw)) {
		return raw.map((node, i) => {
			if (typeof node === "string") return { id: node, label: node }
			const o = asRecord(node) ?? {}
			const id = asString(o.id ?? o.key ?? o.name, `n${i}`)
			return { id, label: asString(o.label ?? o.name ?? o.title ?? o.text, id) }
		})
	}
	const o = asRecord(raw)
	if (!o) return []
	return Object.entries(o).map(([id, value]) => {
		const nested = asRecord(value)
		if (nested) {
			return { id: asString(nested.id, id), label: asString(nested.label ?? nested.name ?? nested.title, id) }
		}
		return { id, label: asString(value, id) }
	})
}

export function parseEdges(raw: unknown): ArtifactEdge[] {
	if (!Array.isArray(raw)) return []
	return raw.flatMap((edge) => {
		const o = asRecord(edge)
		if (!o) return []
		const from = asString(o.from ?? o.source ?? o.src ?? o.start)
		const to = asString(o.to ?? o.target ?? o.dst ?? o.end)
		if (!from || !to) return []
		const label = o.label == null ? undefined : asString(o.label)
		return label ? [{ from, to, label }] : [{ from, to }]
	})
}
