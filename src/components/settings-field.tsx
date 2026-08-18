import { Info } from "lucide-react"
import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function Field({
	label,
	tip,
	field,
	children,
}: {
	label: string
	tip?: string
	field?: string
	children: ReactNode
}) {
	return (
		<div className="grid gap-2" data-field={field}>
			<div className="flex items-center gap-0.5">
				<Label>{label}</Label>
				{tip ? <InfoTip text={tip} /> : null}
			</div>
			{children}
		</div>
	)
}

export function InfoTip({ text }: { text: string }) {
	return (
		<Popover>
			<PopoverTrigger
				render={
					<button
						type="button"
						className="inline-flex size-7 items-center justify-center rounded-full text-subtle outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50"
						aria-label="About this setting"
					/>
				}
			>
				<Info className="size-3.5" />
			</PopoverTrigger>
			<PopoverContent>{text}</PopoverContent>
		</Popover>
	)
}
