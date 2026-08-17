import { createFileRoute } from "@tanstack/react-router"
import { AssistantShell } from "@/components/assistant-shell"
import { AppErrorComponent } from "@/lib/error-component"

export const Route = createFileRoute("/")({ component: Home, errorComponent: AppErrorComponent })

function Home() {
	return <AssistantShell />
}
