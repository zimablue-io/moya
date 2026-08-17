import { ChevronDown, ChevronUp } from "lucide-react"
import { type MouseEvent, type RefObject, useEffect, useMemo, useState } from "react"
import { speakerLabel } from "@/lib/brand"
import { useApp } from "@/lib/store"
import { previewSnippet, tickIndexAtY, tickY, visibleTickIndices } from "@/lib/transcript"
import { cn, formatWhen } from "@/lib/utils"

export type MinimapTurn = {
	id: string
	role: string
	content: string
	createdAt: string
}

export function TranscriptMinimap({
	messages,
	viewportRef,
	itemRefs,
}: {
	messages: MinimapTurn[]
	viewportRef: RefObject<HTMLDivElement | null>
	itemRefs: RefObject<Map<string, HTMLElement>>
}) {
	const agentName = useApp((s) => s.settings.agentName)
	const [trackH, setTrackH] = useState(0)
	const [hover, setHover] = useState<{ index: number; y: number } | null>(null)
	const [scroll, setScroll] = useState({ top: 0, height: 1, scrollHeight: 1 })

	useEffect(() => {
		const el = viewportRef.current
		if (!el) return
		const update = () => {
			setScroll({
				top: el.scrollTop,
				height: el.clientHeight,
				scrollHeight: Math.max(1, el.scrollHeight),
			})
		}
		update()
		el.addEventListener("scroll", update, { passive: true })
		const ro = new ResizeObserver(update)
		ro.observe(el)
		const content = el.firstElementChild
		if (content) ro.observe(content)
		return () => {
			el.removeEventListener("scroll", update)
			ro.disconnect()
		}
	}, [viewportRef])

	const ticks = useMemo(() => visibleTickIndices(messages.length, trackH), [messages.length, trackH])
	const hovered = hover ? messages[hover.index] : null
	const maxScroll = Math.max(1, scroll.scrollHeight - scroll.height)
	const thumbTop = (scroll.top / maxScroll) * trackH

	function scrollToIndex(index: number) {
		const msg = messages[index]
		if (!msg) return
		itemRefs.current?.get(msg.id)?.scrollIntoView({ block: "center", behavior: "smooth" })
	}

	function page(dir: -1 | 1) {
		const el = viewportRef.current
		if (!el) return
		el.scrollBy({ top: dir * el.clientHeight * 0.9, behavior: "smooth" })
	}

	function indexFromEvent(e: MouseEvent<HTMLDivElement>) {
		const rect = e.currentTarget.getBoundingClientRect()
		const y = e.clientY - rect.top
		return { index: tickIndexAtY(y, rect.height, messages.length), y }
	}

	if (messages.length === 0) return <div className="w-7 shrink-0" aria-hidden />

	return (
		<div className="relative flex w-7 shrink-0 flex-col items-center py-0.5">
			<button
				type="button"
				className="grid size-6 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg"
				aria-label="Scroll up"
				onClick={() => page(-1)}
			>
				<ChevronUp className="size-3.5" />
			</button>
			<div
				ref={(node) => setTrackH(node?.clientHeight ?? 0)}
				className="relative min-h-0 w-full flex-1 cursor-pointer"
				role="slider"
				aria-label="Transcript position"
				aria-valuemin={0}
				aria-valuemax={Math.max(0, messages.length - 1)}
				aria-valuenow={tickIndexAtY(thumbTop, trackH || 1, messages.length)}
				tabIndex={0}
				onMouseMove={(e) => setHover(indexFromEvent(e))}
				onMouseLeave={() => setHover(null)}
				onClick={(e) => scrollToIndex(indexFromEvent(e).index)}
				onKeyDown={(e) => {
					if (e.key === "ArrowDown" || e.key === "PageDown") {
						e.preventDefault()
						page(1)
					} else if (e.key === "ArrowUp" || e.key === "PageUp") {
						e.preventDefault()
						page(-1)
					} else if (e.key === "Home") {
						e.preventDefault()
						scrollToIndex(0)
					} else if (e.key === "End") {
						e.preventDefault()
						scrollToIndex(messages.length - 1)
					}
				}}
			>
				<div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border" />
				{ticks.map((index) => (
					<span
						key={index}
						className={cn(
							"pointer-events-none absolute left-1/2 h-px w-2.5 -translate-x-1/2 bg-fg/45",
							hover?.index === index && "w-3.5 bg-fg",
						)}
						style={{ top: tickY(index, messages.length, trackH) }}
					/>
				))}
				<div
					className="pointer-events-none absolute left-1/2 w-3.5 -translate-x-1/2 rounded-full bg-fg"
					style={{ top: thumbTop, height: 2 }}
				/>
			</div>
			<button
				type="button"
				className="grid size-6 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg"
				aria-label="Scroll down"
				onClick={() => page(1)}
			>
				<ChevronDown className="size-3.5" />
			</button>
			{hovered && hover ? (
				<div
					className="pointer-events-none absolute right-8 z-10 w-56 -translate-y-1/2 rounded-lg border border-border bg-surface p-3 shadow-xl"
					style={{ top: Math.min(Math.max(hover.y + 28, 36), (trackH || 0) + 28) }}
				>
					<div className="flex items-baseline justify-between gap-2">
						<span className="type-chip text-muted">{speakerLabel(hovered.role, agentName)}</span>
						<span className="type-time text-subtle">{formatWhen(hovered.createdAt)}</span>
					</div>
					<p className="mt-1 text-sm leading-relaxed text-fg">{previewSnippet(hovered.content)}</p>
				</div>
			) : null}
		</div>
	)
}
