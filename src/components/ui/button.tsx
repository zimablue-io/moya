import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[opacity,transform,background-color,color,box-shadow] duration-150 ease-out outline-none ring-inset select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:not-disabled:scale-[0.96]",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:opacity-90",
				secondary: "bg-surface-2 text-fg hover:bg-surface",
				ghost: "bg-transparent text-fg hover:bg-surface-2",
				outline: "border border-border bg-transparent text-fg hover:bg-surface-2",
				danger: "bg-alert text-fg hover:opacity-90",
				destructive: "bg-alert text-fg hover:opacity-90",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-11 px-4",
				sm: "h-9 px-3 text-xs",
				lg: "h-12 px-5",
				icon: "size-11",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
)

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
