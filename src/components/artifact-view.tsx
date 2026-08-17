import { Component, type ReactNode } from "react"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { type Artifact, normalizeArtifact } from "@/lib/types"
import { cn } from "@/lib/utils"

const ARTIFACT_FALLBACK = "This visual could not be shown."

function ArtifactTitle({ children }: { children: ReactNode }) {
	return <h3 className="type-display text-xl text-fg">{children}</h3>
}

export function ArtifactView({ artifact }: { artifact: Artifact }) {
	const safe = normalizeArtifact(artifact)
	if (!safe) {
		return <p className="text-sm text-muted">{ARTIFACT_FALLBACK}</p>
	}
	return (
		<ArtifactGuard key={`${safe.type}:${safe.title}`}>
			<ArtifactInner artifact={safe} />
		</ArtifactGuard>
	)
}

class ArtifactGuard extends Component<{ children: ReactNode }, { error: Error | null }> {
	state = { error: null as Error | null }

	static getDerivedStateFromError(error: Error) {
		return { error }
	}

	componentDidCatch(error: Error) {
		console.error("[moya] artifact render failed", error)
	}

	render() {
		if (this.state.error) {
			return <p className="text-sm text-muted">{ARTIFACT_FALLBACK}</p>
		}
		return this.props.children
	}
}

function ArtifactInner({ artifact }: { artifact: Artifact }) {
	if (artifact.type === "status") {
		return (
			<div>
				<ArtifactTitle>{artifact.title}</ArtifactTitle>
				<ul className="mt-4 grid gap-2">
					{(artifact.items ?? []).map((item) => (
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
		const series = artifact.series ?? []
		const keys = series.map((s) => s.name)
		const rows = mergeSeries(series)
		return (
			<div>
				<ArtifactTitle>{artifact.title}</ArtifactTitle>
				<div className="mt-4 h-56">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={rows}>
							<CartesianGrid stroke="color-mix(in oklab, var(--color-fg) 8%, transparent)" vertical={false} />
							<XAxis dataKey="x" stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} />
							<YAxis stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} width={32} />
							<Tooltip
								contentStyle={{
									background: "var(--color-surface)",
									border: "1px solid var(--color-border)",
									borderRadius: 8,
									color: "var(--color-fg)",
								}}
							/>
							{keys.map((k, i) => (
								<Line
									key={k}
									type="monotone"
									dataKey={k}
									stroke={i === 0 ? "var(--color-accent)" : "var(--color-muted)"}
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

	if (artifact.type === "mockup") {
		return (
			<div>
				<ArtifactTitle>{artifact.title}</ArtifactTitle>
				<div className="mt-4 grid gap-3">
					{(artifact.frames ?? []).map((frame) => (
						<div key={frame.title} className="rounded-xl border border-border bg-surface-2 p-3">
							<p className="text-xs text-muted">{frame.title}</p>
							<ul className="mt-2 flex flex-col gap-1.5">
								{(frame.blocks ?? []).map((block, i) => (
									<li key={`${block.label}-${i}`} className="rounded-md bg-surface px-2 py-1.5 text-sm text-fg">
										<span className="text-subtle">{block.type}</span> {block.label}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</div>
		)
	}

	return (
		<div>
			<ArtifactTitle>{artifact.title}</ArtifactTitle>
			<p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-fg/90">
				{"body" in artifact ? artifact.body : ""}
			</p>
		</div>
	)
}

function mergeSeries(series: { name: string; points: { x: string; y: number }[] }[]) {
	const map = new Map<string, Record<string, string | number>>()
	for (const s of series) {
		for (const p of s.points ?? []) {
			const row = map.get(p.x) ?? { x: p.x }
			row[s.name] = p.y
			map.set(p.x, row)
		}
	}
	return [...map.values()]
}

function Diagram({ artifact }: { artifact: Extract<Artifact, { type: "diagram" }> }) {
	const nodes = artifact.nodes ?? []
	const edges = artifact.edges ?? []
	const n = Math.max(nodes.length, 1)
	const w = 560
	const h = 280
	const cx = w / 2
	const cy = h / 2
	const r = Math.min(w, h) * 0.34
	const pos = new Map(
		nodes.map((node, i) => {
			const a = (i / n) * Math.PI * 2 - Math.PI / 2
			return [node.id, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, label: node.label ?? "" }]
		}),
	)
	return (
		<div>
			<ArtifactTitle>{artifact.title}</ArtifactTitle>
			<svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full" role="img" aria-label={artifact.title}>
				{edges.map((e, i) => {
					const a = pos.get(e.from)
					const b = pos.get(e.to)
					if (!a || !b) return null
					return (
						<g key={`${e.from}-${e.to}-${i}`}>
							<line
								x1={a.x}
								y1={a.y}
								x2={b.x}
								y2={b.y}
								stroke="color-mix(in oklab, var(--color-accent) 35%, transparent)"
							/>
							{e.label ? (
								<text
									x={(a.x + b.x) / 2}
									y={(a.y + b.y) / 2 - 6}
									textAnchor="middle"
									fill="var(--color-muted)"
									fontSize="12"
								>
									{e.label}
								</text>
							) : null}
						</g>
					)
				})}
				{nodes.map((node) => {
					const p = pos.get(node.id)
					if (!p) return null
					const label = node.label ?? ""
					return (
						<g key={node.id}>
							<circle
								cx={p.x}
								cy={p.y}
								r="22"
								fill="var(--color-surface-2)"
								stroke="var(--color-accent)"
								strokeWidth="1"
							/>
							<text x={p.x} y={p.y + 4} textAnchor="middle" fill="var(--color-fg)" fontSize="12">
								{label.length > 12 ? `${label.slice(0, 11)}…` : label}
							</text>
						</g>
					)
				})}
			</svg>
		</div>
	)
}
