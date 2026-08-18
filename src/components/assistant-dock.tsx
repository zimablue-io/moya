import { Keyboard, Radio } from "lucide-react"
import type { ReactNode } from "react"
import { Composer } from "@/components/composer"
import { cn } from "@/lib/utils"

export function AssistantDock({
	composerOpen,
	menuOpen,
	voiceMode,
	draft,
	listening,
	disabled,
	onChange,
	onSend,
	onToggleListen,
	onVoice,
	onType,
}: {
	composerOpen: boolean
	menuOpen: boolean
	voiceMode: boolean
	draft: string
	listening: boolean
	disabled: boolean
	onChange: (v: string) => void
	onSend: () => void
	onToggleListen: () => void
	onVoice: () => void
	onType: () => void
}) {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
			<div className="relative w-full max-w-xl">
				<div
					className={cn(
						"flex items-center justify-center gap-2 transition-[opacity,transform,filter] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
						composerOpen || menuOpen
							? "pointer-events-none scale-[0.98] opacity-0 blur-[2px]"
							: "pointer-events-auto scale-100 opacity-100 blur-0",
					)}
				>
					<ModeBtn active={voiceMode} label="Voice" onClick={onVoice}>
						<Radio className="size-4" />
					</ModeBtn>
					<ModeBtn active={false} label="Type" onClick={onType}>
						<Keyboard className="size-4" />
					</ModeBtn>
				</div>
				<div className="absolute inset-x-0 bottom-0">
					<Composer
						open={composerOpen}
						value={draft}
						listening={listening}
						disabled={disabled}
						onChange={onChange}
						onSend={onSend}
						onToggleListen={onToggleListen}
					/>
				</div>
			</div>
		</div>
	)
}

function ModeBtn({
	active,
	label,
	onClick,
	children,
}: {
	active: boolean
	label: string
	onClick: () => void
	children: ReactNode
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"type-chip flex h-11 items-center gap-2 rounded-full border px-4 transition-colors outline-none",
				"focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
				active
					? "border-primary bg-primary text-primary-foreground"
					: "border-border bg-surface text-muted-foreground hover:text-fg",
			)}
		>
			{children}
			{label}
		</button>
	)
}
