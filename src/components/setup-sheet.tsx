import { useEffect, useState } from "react"
import { ModelTab } from "@/components/settings-model"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { providerSetupNeeded, setupProviderDraft } from "@/lib/first-run"
import { hostCaps, liveSettings } from "@/lib/host"
import { useApp } from "@/lib/store"

export type SetupPending = { kind: "send"; text: string } | { kind: "voice" }

export function SetupSheet({
	open,
	pending,
	onOpenChange,
	onReady,
}: {
	open: boolean
	pending: SetupPending | null
	onOpenChange: (open: boolean) => void
	onReady: (pending: SetupPending) => void
}) {
	const settings = useApp((s) => s.settings)
	const dispatch = useApp((s) => s.dispatch)
	const caps = hostCaps()
	const [busy, setBusy] = useState(false)
	const [ggufBusy, setGgufBusy] = useState(false)
	const needs = providerSetupNeeded(liveSettings(settings).provider)

	useEffect(() => {
		if (!open) return
		const current = useApp.getState().settings.provider
		const next = setupProviderDraft(current, hostCaps())
		if (next.id === current.id && next.model === current.model) return
		void dispatch("settings.provider", {
			id: next.id,
			model: next.model,
			baseUrl: next.baseUrl,
			apiKey: next.apiKey,
		})
	}, [open, dispatch])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Where should I think?</DialogTitle>
					<DialogDescription>
						{caps.onDeviceLlm
							? "Same as Settings → Model. Pick a GGUF on this device."
							: "Same as Settings → Model. Keys stay on this device."}
					</DialogDescription>
				</DialogHeader>
				<ModelTab onGgufBusy={setGgufBusy} />
				<DialogFooter>
					<Button
						type="button"
						disabled={Boolean(needs) || busy || ggufBusy}
						onClick={() => {
							if (!pending) return
							setBusy(true)
							onOpenChange(false)
							onReady(pending)
							setBusy(false)
						}}
					>
						{ggufBusy ? "Loading…" : "Continue"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
