import { cn } from "@/lib/utils"

export function chipToggleClass(active: boolean, className?: string) {
	return cn(
		"type-chip h-9 rounded-full px-3 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
		active ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:bg-surface hover:text-fg",
		className,
	)
}
