import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"
import * as React from "react"
import { cn } from "@/lib/utils"

type ScrollAreaProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
	viewportRef?: React.Ref<HTMLDivElement>
	hideScrollbar?: boolean
}

export const ScrollArea = React.forwardRef<React.ComponentRef<typeof ScrollAreaPrimitive.Root>, ScrollAreaProps>(
	({ className, children, viewportRef, hideScrollbar, ...props }, ref) => (
		<ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
			<ScrollAreaPrimitive.Viewport ref={viewportRef} className="size-full rounded-[inherit]">
				{children}
			</ScrollAreaPrimitive.Viewport>
			{hideScrollbar ? null : (
				<ScrollAreaPrimitive.ScrollAreaScrollbar
					orientation="vertical"
					className="flex touch-none p-0.5 transition-colors select-none"
				>
					<ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border-strong" />
				</ScrollAreaPrimitive.ScrollAreaScrollbar>
			)}
		</ScrollAreaPrimitive.Root>
	),
)
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName
