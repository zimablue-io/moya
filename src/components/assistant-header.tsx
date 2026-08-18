import { LayoutGrid, X } from "lucide-react"
import { displayName } from "@/lib/brand"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"

export function AssistantHeader({ clock, pending }: { clock: string; pending: number }) {
	const agentName = useApp((s) => s.settings.agentName)
	const menuOpen = useApp((s) => s.menuOpen)
	const setMenuOpen = useApp((s) => s.setMenuOpen)

	return (
		<header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
			<div>
				<p className="type-display text-2xl text-fg">{displayName(agentName)}</p>
				<p className="type-clock mt-1 text-muted-foreground">{clock}</p>
			</div>
			<button
				type="button"
				aria-label={menuOpen ? "Hide tools" : "Show tools"}
				aria-expanded={menuOpen}
				onClick={() => setMenuOpen(!menuOpen)}
				className={cn(
					"pointer-events-auto relative z-40 grid size-11 place-items-center rounded-full text-muted-foreground transition-[color,background-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
					menuOpen && "bg-surface-2 text-fg",
				)}
			>
				<span className="relative size-4">
					<LayoutGrid
						className={cn(
							"absolute inset-0 size-4 transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
							menuOpen ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0",
						)}
					/>
					<X
						className={cn(
							"absolute inset-0 size-4 transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
							menuOpen ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]",
						)}
					/>
				</span>
				{pending && !menuOpen ? <span className="absolute top-2 right-2 size-1.5 rounded-full bg-warn" /> : null}
			</button>
		</header>
	)
}
