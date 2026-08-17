import { createFileRoute } from "@tanstack/react-router"
import { AssistantShell } from "@/components/assistant-shell"

export const Route = createFileRoute("/")({ component: Home })

function Home() {
	return <AssistantShell />
}
