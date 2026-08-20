import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@/lib/utils"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				"peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors outline-none",
				"data-checked:bg-primary data-unchecked:bg-surface-2",
				"ring-inset focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className={cn(
					"pointer-events-none block size-5 rounded-full bg-fg shadow-sm transition-transform",
					"data-checked:translate-x-5 data-checked:bg-primary-foreground data-unchecked:translate-x-0.5",
				)}
			/>
		</SwitchPrimitive.Root>
	)
}

export { Switch }
