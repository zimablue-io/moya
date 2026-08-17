import * as SliderPrimitive from "@radix-ui/react-slider"
import * as React from "react"
import { cn } from "@/lib/utils"

export const Slider = React.forwardRef<
	React.ComponentRef<typeof SliderPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
	<SliderPrimitive.Root
		ref={ref}
		className={cn("relative flex w-full touch-none select-none items-center", className)}
		{...props}
	>
		<SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-surface-2">
			<SliderPrimitive.Range className="absolute h-full bg-accent" />
		</SliderPrimitive.Track>
		<SliderPrimitive.Thumb className="block size-4 rounded-full bg-fg shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
	</SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName
