import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

function Label({ className, ...props }: ComponentProps<"label">) {
	return <label data-slot="label" className={cn("type-chip text-muted-foreground", className)} {...props} />
}

export { Label }
