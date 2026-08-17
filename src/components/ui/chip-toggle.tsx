import { cn } from "@/lib/utils"

export function chipToggleClass(active: boolean, className?: string) {
	return cn(
		"type-chip h-9 rounded-full px-3 transition-colors",
		active ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:bg-surface hover:text-fg",
		className,
	)
}
