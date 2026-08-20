import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "@/lib/utils"

function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			data-orientation={orientation}
			className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
			{...props}
		/>
	)
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn("flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1", className)}
			{...props}
		/>
	)
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
	return (
		<TabsPrimitive.Tab
			data-slot="tabs-trigger"
			className={cn(
				"type-chip inline-flex h-9 items-center justify-center rounded-md px-3 text-muted-foreground transition-colors outline-none",
				"data-active:bg-surface data-active:text-fg",
				"ring-inset focus-visible:ring-3 focus-visible:ring-ring/50",
				className,
			)}
			{...props}
		/>
	)
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
	return <TabsPrimitive.Panel data-slot="tabs-content" className={cn("mt-4 outline-none", className)} {...props} />
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
