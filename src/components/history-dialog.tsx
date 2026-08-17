import { useEffect, useMemo, useRef, useState } from "react"
import { ArtifactView } from "@/components/artifact-view"
import { TranscriptCalendar } from "@/components/transcript-calendar"
import { TranscriptMinimap } from "@/components/transcript-minimap"
import { Button } from "@/components/ui/button"
import { chipToggleClass } from "@/components/ui/chip-toggle"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { speakerLabel } from "@/lib/brand"
import { useApp } from "@/lib/store"
import {
	activityByDay,
	filterByDay,
	formatLocalDayKey,
	formatTranscriptStats,
	isTranscriptTurn,
	transcriptStats,
} from "@/lib/transcript"
import { cn, formatWhen } from "@/lib/utils"

type ViewMode = "list" | "calendar"

const VIEWS: { id: ViewMode; label: string }[] = [
	{ id: "list", label: "List" },
	{ id: "calendar", label: "Calendar" },
]

export function HistoryDialog() {
	const dialog = useApp((s) => s.dialog)
	const openDialog = useApp((s) => s.openDialog)
	const messages = useApp((s) => s.messages)
	const send = useApp((s) => s.send)
	const agentName = useApp((s) => s.settings.agentName)
	const [q, setQ] = useState("")
	const [dayKey, setDayKey] = useState<string | null>(null)
	const [mode, setMode] = useState<ViewMode>("list")
	const [month, setMonth] = useState(() => new Date())
	const viewportRef = useRef<HTMLDivElement>(null)
	const itemRefs = useRef(new Map<string, HTMLElement>())
	const open = dialog === "history"

	const turns = useMemo(() => messages.filter(isTranscriptTurn), [messages])
	const activity = useMemo(() => activityByDay(turns), [turns])
	const byDay = useMemo(() => filterByDay(turns, dayKey), [dayKey, turns])
	const visible = useMemo(() => {
		const needle = q.trim().toLowerCase()
		if (!needle) return byDay
		return byDay.filter((m) => m.content.toLowerCase().includes(needle))
	}, [byDay, q])
	const stats = useMemo(() => formatTranscriptStats(transcriptStats(visible)), [visible])
	const lastId = visible[visible.length - 1]?.id

	useEffect(() => {
		if (!open) {
			setDayKey(null)
			setQ("")
			setMode("list")
		}
	}, [open])

	useEffect(() => {
		if (!open || mode !== "list" || !lastId) return
		const frame = requestAnimationFrame(() => {
			itemRefs.current.get(lastId)?.scrollIntoView({ block: "end" })
		})
		return () => cancelAnimationFrame(frame)
	}, [lastId, mode, open])

	const empty = turns.length === 0 ? "No turns yet." : dayKey && byDay.length === 0 ? "No turns this day." : "No match."

	return (
		<Dialog open={open} onOpenChange={(o) => openDialog(o ? "history" : null)}>
			<DialogContent className="grid h-[min(88dvh,44rem)] min-h-[min(88dvh,44rem)] w-[min(100vw-1.5rem,40rem)] grid-rows-[auto_2.75rem_1.25rem_minmax(0,1fr)_auto]">
				<DialogHeader>
					<DialogTitle>Transcript</DialogTitle>
					<DialogDescription>Everything said here stays on this machine.</DialogDescription>
				</DialogHeader>
				<div className="flex h-11 items-center gap-2">
					<div className="min-w-0 flex-1">
						{mode === "list" ? (
							<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-11" />
						) : (
							<p className="flex h-11 items-center text-sm text-muted">Pick a day to open its turns.</p>
						)}
					</div>
					<div className="flex shrink-0 gap-1">
						{VIEWS.map((v) => (
							<button key={v.id} type="button" onClick={() => setMode(v.id)} className={chipToggleClass(mode === v.id)}>
								{v.label}
							</button>
						))}
					</div>
				</div>
				<div className="flex h-5 items-center justify-between gap-2">
					<p className="type-time truncate text-muted">
						{mode === "list" ? (visible.length > 0 ? stats : empty) : "Days with activity are highlighted."}
					</p>
					{mode === "list" && dayKey ? (
						<button
							type="button"
							className="shrink-0 text-xs text-muted transition-colors hover:text-fg"
							onClick={() => setDayKey(null)}
						>
							All days · {formatLocalDayKey(dayKey)}
						</button>
					) : null}
				</div>
				{mode === "calendar" ? (
					<div className="min-h-0 overflow-hidden">
						<TranscriptCalendar
							dayKey={dayKey}
							activity={activity}
							month={month}
							onMonthChange={setMonth}
							onPickDay={(key) => {
								setDayKey(key)
								setMode("list")
							}}
						/>
					</div>
				) : (
					<div className="flex min-h-0 overflow-hidden">
						<ScrollArea className="min-h-0 min-w-0 flex-1 pr-1" viewportRef={viewportRef} hideScrollbar>
							<ol className="flex flex-col gap-3 pb-2">
								{visible.length === 0 ? (
									<li className="py-10 text-center text-sm text-muted">{empty}</li>
								) : (
									visible.map((m) => (
										<li
											key={m.id}
											ref={(el) => {
												if (el) itemRefs.current.set(m.id, el)
												else itemRefs.current.delete(m.id)
											}}
											className="flex flex-col gap-1 rounded-lg px-1 py-0.5 transition-colors hover:bg-surface-2"
										>
											<div className="flex items-baseline justify-between gap-3">
												<span className="type-chip text-muted">{speakerLabel(m.role, agentName)}</span>
												<span className="type-time text-subtle">{formatWhen(m.createdAt)}</span>
											</div>
											<p className={cn("text-sm leading-relaxed", m.role === "user" ? "text-fg" : "text-fg/85")}>
												{m.content}
											</p>
											{m.artifacts?.map((a, i) => (
												<div key={i} className="rounded-lg bg-surface-2 p-3">
													<ArtifactView artifact={a} />
												</div>
											))}
										</li>
									))
								)}
							</ol>
						</ScrollArea>
						<TranscriptMinimap messages={visible} viewportRef={viewportRef} itemRefs={itemRefs} />
					</div>
				)}
				<div className="flex h-11 items-center justify-end">
					<Button
						variant="outline"
						onClick={() => {
							openDialog(null)
							void send("Analyze our full transcript. Themes, decisions, open loops, and where my time is going.")
						}}
					>
						Analyze
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
