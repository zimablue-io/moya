import { Brain, Download, History, MessageSquare, Repeat, Settings } from "lucide-react"
import { menuToolsForHost, showDownloadApp } from "@/lib/first-run"
import { isDesktop } from "@/lib/host"
import { macAppInstallUrl } from "@/lib/mac-download"
import { useApp } from "@/lib/store"
import { type DialogId } from "@/lib/types"
import { cn } from "@/lib/utils"

const DIALOG_TOOLS: {
	id: Exclude<DialogId, "artifact" | null>
	label: string
	hint: string
	icon: typeof Brain
}[] = [
	{ id: "history", label: "Transcript", hint: "Every word", icon: History },
	{ id: "memory", label: "Memory", hint: "What stays", icon: Brain },
	{ id: "routines", label: "Routines", hint: "What runs", icon: Repeat },
	{ id: "watch", label: "Watch", hint: "Needs you", icon: MessageSquare },
	{ id: "settings", label: "Settings", hint: "Name, voice, model", icon: Settings },
]

export function AssistantMenu({ pending }: { pending: number }) {
	const menuOpen = useApp((s) => s.menuOpen)
	const setMenuOpen = useApp((s) => s.setMenuOpen)
	const openDialog = useApp((s) => s.openDialog)
	const desktop = isDesktop()
	const tools = menuToolsForHost(desktop)
		.map((id) => DIALOG_TOOLS.find((t) => t.id === id))
		.filter((t): t is (typeof DIALOG_TOOLS)[number] => Boolean(t))

	return (
		<div
			className={cn(
				"absolute inset-0 z-30 transition-[opacity,backdrop-filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
				menuOpen ? "opacity-100" : "pointer-events-none opacity-0",
			)}
		>
			<button
				type="button"
				aria-label="Dismiss tools"
				className="absolute inset-0 bg-bg/55"
				onClick={() => setMenuOpen(false)}
			/>
			<div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col justify-center gap-3 px-6 sm:px-10">
				{tools.map((tool, i) => (
					<button
						key={tool.id}
						type="button"
						onClick={() => {
							openDialog(tool.id)
						}}
						style={{ transitionDelay: menuOpen ? `${i * 45}ms` : "0ms" }}
						className={cn(
							"group flex items-center justify-end gap-4 text-right transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none ring-inset focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
							menuOpen ? "translate-x-0 opacity-100 blur-0" : "translate-x-6 opacity-0 blur-[4px]",
						)}
					>
						<span className="min-w-0">
							<span className="block type-display text-2xl text-fg">{tool.label}</span>
							<span className="block text-xs text-muted-foreground">{tool.hint}</span>
						</span>
						<span className="relative grid size-14 shrink-0 place-items-center rounded-full border border-border bg-surface text-fg transition-colors group-hover:border-border-strong group-hover:bg-surface-2">
							<tool.icon className="size-5" />
							{tool.id === "watch" && pending ? (
								<span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-warn" />
							) : null}
						</span>
					</button>
				))}
				{showDownloadApp(desktop) ? (
					<a
						href={macAppInstallUrl()}
						onClick={() => setMenuOpen(false)}
						style={{ transitionDelay: menuOpen ? `${tools.length * 45}ms` : "0ms" }}
						className={cn(
							"group flex items-center justify-end gap-4 text-right transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none ring-inset focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
							menuOpen ? "translate-x-0 opacity-100 blur-0" : "translate-x-6 opacity-0 blur-[4px]",
						)}
					>
						<span className="min-w-0">
							<span className="block type-display text-2xl text-fg">Mac app</span>
							<span className="block text-xs text-muted-foreground">Build on this Mac</span>
						</span>
						<span className="relative grid size-14 shrink-0 place-items-center rounded-full border border-border bg-surface text-fg transition-colors group-hover:border-border-strong group-hover:bg-surface-2">
							<Download className="size-5" />
						</span>
					</a>
				) : null}
			</div>
		</div>
	)
}
