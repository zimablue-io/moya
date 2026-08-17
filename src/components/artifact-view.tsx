import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { Artifact } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ArtifactView({ artifact }: { artifact: Artifact }) {
	if (artifact.type === "status") {
		return (
			<div>
				<h3 className="font-display text-xl text-fg">{artifact.title}</h3>
				<ul className="mt-4 grid gap-2">
					{artifact.items.map((item) => (
						<li
							key={item.label}
							className="flex items-baseline justify-between gap-4 rounded-lg bg-surface-2 px-3 py-2"
						>
							<span className="text-sm text-muted">{item.label}</span>
							<span
								className={cn(
									"text-sm tabular-nums text-fg",
									item.tone === "ok" && "text-ok",
									item.tone === "warn" && "text-warn",
									item.tone === "alert" && "text-alert",
								)}
							>
								{item.value}
							</span>
						</li>
					))}
				</ul>
			</div>
		)
	}

	if (artifact.type === "chart") {
		const keys = artifact.series.map((s) => s.name)
		const rows = mergeSeries(artifact.series)
		return (
			<div>
				<h3 className="font-display text-xl text-fg">{artifact.title}</h3>
				<div className="mt-4 h-56">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={rows}>
							<CartesianGrid stroke="rgba(236,234,228,0.08)" vertical={false} />
							<XAxis dataKey="x" stroke="#8a8780" fontSize={11} tickLine={false} axisLine={false} />
							<YAxis stroke="#8a8780" fontSize={11} tickLine={false} axisLine={false} width={32} />
							<Tooltip
								contentStyle={{
									background: "#141413",
									border: "1px solid rgba(236,234,228,0.12)",
									borderRadius: 8,
									color: "#eceae4",
								}}
							/>
							{keys.map((k, i) => (
								<Line
									key={k}
									type="monotone"
									dataKey={k}
									stroke={i === 0 ? "#d4cfc4" : "#8a8780"}
									strokeWidth={1.6}
									dot={false}
								/>
							))}
						</LineChart>
					</ResponsiveContainer>
				</div>
			</div>
		)
	}

	if (artifact.type === "diagram") {
		return <Diagram artifact={artifact} />
	}

	return (
		<div>
			<h3 className="font-display text-xl text-fg">{artifact.title}</h3>
			<p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-fg/90">{artifact.body}</p>
		</div>
	)
}

function mergeSeries(series: { name: string; points: { x: string; y: number }[] }[]) {
	const map = new Map<string, Record<string, string | number>>()
	for (const s of series) {
		for (const p of s.points) {
			const row = map.get(p.x) ?? { x: p.x }
			row[s.name] = p.y
			map.set(p.x, row)
		}
	}
	return [...map.values()]
}

function Diagram({ artifact }: { artifact: Extract<Artifact, { type: "diagram" }> }) {
	const n = Math.max(artifact.nodes.length, 1)
	const w = 560
	const h = 280
	const cx = w / 2
	const cy = h / 2
	const r = Math.min(w, h) * 0.34
	const pos = new Map(
		artifact.nodes.map((node, i) => {
			const a = (i / n) * Math.PI * 2 - Math.PI / 2
			return [node.id, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, label: node.label }]
		}),
	)
	return (
		<div>
			<h3 className="font-display text-xl text-fg">{artifact.title}</h3>
			<svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full" role="img" aria-label={artifact.title}>
				{artifact.edges.map((e, i) => {
					const a = pos.get(e.from)
					const b = pos.get(e.to)
					if (!a || !b) return null
					return (
						<g key={`${e.from}-${e.to}-${i}`}>
							<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(212,207,196,0.35)" />
							{e.label ? (
								<text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" fill="#8a8780" fontSize="10">
									{e.label}
								</text>
							) : null}
						</g>
					)
				})}
				{artifact.nodes.map((node) => {
					const p = pos.get(node.id)
					if (!p) return null
					return (
						<g key={node.id}>
							<circle cx={p.x} cy={p.y} r="22" fill="#1c1c1a" stroke="#d4cfc4" strokeWidth="1" />
							<text x={p.x} y={p.y + 4} textAnchor="middle" fill="#eceae4" fontSize="10">
								{node.label.length > 12 ? `${node.label.slice(0, 11)}…` : node.label}
							</text>
						</g>
					)
				})}
			</svg>
		</div>
	)
}
