import { ChevronLeft, ChevronRight } from "lucide-react"
import { type ComponentProps, useMemo, useState } from "react"
import { Calendar, calendarNavBtn } from "@/components/ui/calendar"
import { dateFromLocalDayKey, heatDatesByLevel, localDayKeyFromDate } from "@/lib/transcript"
import { cn } from "@/lib/utils"

function monthLabel(d: Date): string {
	return d.toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

function DayCell({
	day,
	modifiers,
	className,
	count,
	...props
}: ComponentProps<"button"> & {
	day: { date: Date }
	modifiers: { selected?: boolean }
	count: number
}) {
	const [hot, setHot] = useState(false)
	return (
		<button
			type="button"
			{...props}
			data-hover={hot ? "true" : "false"}
			className={cn(className, hot && !modifiers.selected && "bg-surface-2")}
			style={props.style}
			onPointerEnter={(e) => {
				props.onPointerEnter?.(e)
				setHot(true)
			}}
			onPointerLeave={(e) => {
				props.onPointerLeave?.(e)
				setHot(false)
			}}
		>
			<span className="tabular-nums">{day.date.getDate()}</span>
			{count > 0 ? (
				<span className={cn("type-time", modifiers.selected ? "text-accent-fg" : "text-muted")}>
					{count} {count === 1 ? "turn" : "turns"}
				</span>
			) : null}
		</button>
	)
}

export function TranscriptCalendar({
	dayKey,
	activity,
	month,
	onMonthChange,
	onPickDay,
}: {
	dayKey: string | null
	activity: Map<string, number>
	month: Date
	onMonthChange: (month: Date) => void
	onPickDay: (key: string) => void
}) {
	const selected = dayKey ? dateFromLocalDayKey(dayKey) : undefined
	const heat = useMemo(() => heatDatesByLevel(activity), [activity])

	return (
		<Calendar
			mode="single"
			selected={selected}
			month={month}
			onMonthChange={onMonthChange}
			onSelect={(d) => {
				if (d) onPickDay(localDayKeyFromDate(d))
			}}
			className="flex h-full min-h-0 flex-col p-0"
			classNames={{
				months: "flex min-h-0 flex-1 flex-col",
				month: "flex min-h-0 flex-1 flex-col gap-2",
				month_caption: "sr-only",
				nav: "flex h-10 shrink-0 items-center gap-2",
				month_grid: "flex min-h-0 w-full flex-1 flex-col",
				weekdays: "flex shrink-0",
				weekday: "type-chip flex-1 py-1 text-center text-muted",
				weeks: "flex min-h-0 flex-1 flex-col gap-1",
				week: "flex min-h-0 flex-1 gap-1",
				day: "min-h-0 min-w-0 flex-1 p-0",
				day_button: cn(
					"type-chip flex size-full min-h-0 flex-col items-start gap-0.5 rounded-lg p-1.5 text-left text-fg",
					"hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				),
				selected: "[&>button]:bg-accent [&>button]:text-accent-fg [&>button]:hover:bg-accent",
				today: "[&>button]:ring-1 [&>button]:ring-border-strong",
				outside: "[&>button]:text-subtle [&>button]:hover:text-fg",
			}}
			modifiers={{ heat1: heat.heat1, heat2: heat.heat2, heat3: heat.heat3 }}
			modifiersClassNames={{
				heat1:
					"[&>button]:bg-[color-mix(in_oklab,var(--color-accent)_16%,transparent)] [&>button]:hover:bg-[color-mix(in_oklab,var(--color-accent)_28%,transparent)]",
				heat2:
					"[&>button]:bg-[color-mix(in_oklab,var(--color-accent)_28%,transparent)] [&>button]:hover:bg-[color-mix(in_oklab,var(--color-accent)_40%,transparent)]",
				heat3:
					"[&>button]:bg-[color-mix(in_oklab,var(--color-accent)_42%,transparent)] [&>button]:hover:bg-[color-mix(in_oklab,var(--color-accent)_54%,transparent)]",
			}}
			components={{
				Nav: ({ onPreviousClick, onNextClick, previousMonth, nextMonth }) => (
					<div className="flex h-10 shrink-0 items-center gap-2">
						<button
							type="button"
							className={calendarNavBtn}
							aria-label="Previous month"
							disabled={!previousMonth}
							onClick={onPreviousClick}
						>
							<ChevronLeft className="size-4" />
						</button>
						<p className="type-display min-w-0 flex-1 text-center text-xl text-fg">{monthLabel(month)}</p>
						<button
							type="button"
							className={calendarNavBtn}
							aria-label="Next month"
							disabled={!nextMonth}
							onClick={onNextClick}
						>
							<ChevronRight className="size-4" />
						</button>
					</div>
				),
				DayButton: ({ day, modifiers, className, ...props }) => (
					<DayCell
						{...props}
						day={day}
						modifiers={modifiers}
						className={className}
						count={activity.get(localDayKeyFromDate(day.date)) ?? 0}
					/>
				),
			}}
		/>
	)
}
