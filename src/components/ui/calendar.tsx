import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DayPickerProps } from "react-day-picker"
import { cn } from "@/lib/utils"

export type CalendarProps = DayPickerProps

export const calendarNavBtn =
	"grid size-9 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"

export function Calendar({ className, classNames, showOutsideDays = true, components, ...props }: CalendarProps) {
	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			className={cn("p-1", className)}
			{...props}
			classNames={{
				months: "flex flex-col",
				month: "flex flex-col gap-3",
				month_caption: "flex h-9 items-center justify-center",
				caption_label: "text-sm font-medium text-fg",
				nav: "flex items-center justify-between",
				button_previous: calendarNavBtn,
				button_next: calendarNavBtn,
				month_grid: "w-full border-collapse",
				weekdays: "flex",
				weekday: "size-8 text-center text-[11px] font-medium text-muted",
				weeks: "flex flex-col gap-1",
				week: "flex w-full",
				day: "p-0 text-center",
				day_button:
					"grid size-8 place-items-center rounded-md text-xs font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				selected: "[&>button]:bg-accent [&>button]:text-accent-fg [&>button]:hover:bg-accent",
				today: "[&>button]:border [&>button]:border-border-strong",
				outside: "[&>button]:text-subtle",
				disabled: "[&>button]:text-subtle [&>button]:opacity-40",
				hidden: "invisible",
				...classNames,
			}}
			components={{
				Chevron: ({ orientation }) =>
					orientation === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />,
				...components,
			}}
		/>
	)
}
