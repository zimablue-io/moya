import { useEffect, useState } from "react"
import { Field } from "@/components/settings-field"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { providerSetupNeeded } from "@/lib/first-run"
import { isDesktop } from "@/lib/host"
import { useApp } from "@/lib/store"
import {
	PROVIDER_PRESETS,
	type ProviderConfig,
	type ProviderId,
	providerChoicesForHost,
	providerForHost,
} from "@/lib/types"

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
	const desktop = isDesktop()
	const choices = providerChoicesForHost(desktop)
	const [draft, setDraft] = useState<ProviderConfig>(() => providerForHost(settings.provider, desktop))
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		if (open) setDraft(providerForHost(useApp.getState().settings.provider, isDesktop()))
	}, [open])

	const needs = providerSetupNeeded(draft)
	const wantsKey =
		draft.id === "xai" ||
		draft.id === "openai" ||
		draft.id === "groq" ||
		draft.id === "openrouter" ||
		draft.id === "custom"
	const wantsUrl = draft.id === "custom" || draft.id === "ollama" || draft.id === "llamacpp"

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Where should I think?</DialogTitle>
					<DialogDescription>Keys stay on this device. Moya does not start a model for you.</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<Field label="Provider">
						<Select
							items={choices.map((id) => ({
								value: id,
								label: PROVIDER_PRESETS[id].label,
							}))}
							value={draft.id}
							onValueChange={(v) => {
								if (!v) return
								const id = v as ProviderId
								const preset = PROVIDER_PRESETS[id]
								setDraft({ id, model: preset.model, baseUrl: preset.baseUrl, apiKey: "" })
							}}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{choices.map((id) => (
									<SelectItem key={id} value={id}>
										{PROVIDER_PRESETS[id].label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<p className="text-xs text-muted-foreground">{PROVIDER_PRESETS[draft.id].hint}</p>
					{wantsUrl ? (
						<Field label="Base URL">
							<Input value={draft.baseUrl} onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))} />
						</Field>
					) : null}
					{wantsKey ? (
						<Field label="API key (stored only on this device)">
							<Input
								type="password"
								autoComplete="off"
								value={draft.apiKey}
								onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
								placeholder={draft.id === "custom" ? "Optional" : "Required — stored only on this device"}
							/>
						</Field>
					) : null}
					{draft.id === "llamacpp" || draft.id === "custom" ? (
						<Field label="Model">
							<Input value={draft.model} onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))} />
						</Field>
					) : null}
				</div>
				<DialogFooter>
					<Button
						type="button"
						disabled={Boolean(needs) || busy}
						onClick={() => {
							if (!pending) return
							setBusy(true)
							void (async () => {
								const current = useApp.getState().settings.provider
								if (current.id !== draft.id) await dispatch("settings.provider", { id: draft.id })
								if (draft.baseUrl !== useApp.getState().settings.provider.baseUrl) {
									await dispatch("settings.provider", { field: "baseUrl", value: draft.baseUrl })
								}
								if (draft.model !== useApp.getState().settings.provider.model) {
									await dispatch("settings.provider", { field: "model", value: draft.model })
								}
								if (draft.apiKey) {
									await dispatch("settings.provider", { field: "apiKey", value: draft.apiKey })
								}
								setBusy(false)
								onOpenChange(false)
								onReady(pending)
							})()
						}}
					>
						Continue
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
