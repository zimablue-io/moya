import type { ErrorComponentProps } from "@tanstack/react-router"
import { TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { recoverFromRenderError, reloadApp } from "@/lib/recover"
import { useApp } from "@/lib/store"

export function AppErrorComponent({ error, reset }: ErrorComponentProps) {
	const tryAgain = () => {
		useApp.setState(recoverFromRenderError())
		reset()
	}

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
			<span className="text-alert" aria-hidden="true">
				<TriangleAlert className="size-8" strokeWidth={1.5} />
			</span>
			<h1 className="type-display text-2xl">Something broke</h1>
			<p className="max-w-md text-sm break-words text-muted">
				{error.message || "An unexpected error occurred. Try again, or reload."}
			</p>
			<div className="mt-3 flex flex-wrap items-center justify-center gap-2">
				<Button onClick={tryAgain}>Try again</Button>
				<Button variant="outline" onClick={() => reloadApp()}>
					Reload
				</Button>
			</div>
		</main>
	)
}
