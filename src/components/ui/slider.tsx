import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "@/lib/utils"

function Slider({ className, defaultValue, value, min = 0, max = 100, ...props }: SliderPrimitive.Root.Props) {
	const thumbs = Array.isArray(value)
		? value
		: Array.isArray(defaultValue)
			? defaultValue
			: [value ?? defaultValue ?? min]

	return (
		<SliderPrimitive.Root
			className={cn("data-horizontal:w-full data-vertical:h-full", className)}
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			thumbAlignment="edge"
			{...props}
		>
			<SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50">
				<SliderPrimitive.Track
					data-slot="slider-track"
					className="relative h-1 w-full grow overflow-hidden rounded-full bg-surface-2 select-none"
				>
					<SliderPrimitive.Indicator data-slot="slider-range" className="h-full bg-primary select-none" />
				</SliderPrimitive.Track>
				{thumbs.map((_, index) => (
					<SliderPrimitive.Thumb
						data-slot="slider-thumb"
						key={index}
						className="block size-4 shrink-0 rounded-full bg-fg shadow outline-none ring-inset focus-visible:ring-3 focus-visible:ring-ring/50"
					/>
				))}
			</SliderPrimitive.Control>
		</SliderPrimitive.Root>
	)
}

export { Slider }
