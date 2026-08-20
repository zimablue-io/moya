import { useEffect, useState } from "react"
import { Field } from "@/components/settings-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isDesktop } from "@/lib/host"
import { listProviderModels } from "@/lib/llm"
import { useApp } from "@/lib/store"
import {
	isLocalOnlyProvider,
	PROVIDER_PRESETS,
	type ProviderConfig,
	type ProviderId,
	providerChoicesForHost,
	providerForHost,
} from "@/lib/types"

export function ModelTab() {
	const settings = useApp((s) => s.settings)
	const applyProvider = useApp((s) => s.applyProvider)
	const dispatch = useApp((s) => s.dispatch)
	const desktop = isDesktop()
	const choices = providerChoicesForHost(desktop)
	const provider = providerForHost(settings.provider, desktop)
	const preset = PROVIDER_PRESETS[provider.id]

	const writeField = (field: "baseUrl" | "apiKey", value: string) => {
		void (async () => {
			if (!desktop && isLocalOnlyProvider(useApp.getState().settings.provider.id)) {
				await dispatch("settings.provider", { id: provider.id })
			}
			await dispatch("settings.provider", { field, value })
		})()
	}

	return (
		<div className="space-y-4">
			<Field label="Provider" field="provider">
				<Select
					items={choices.map((id) => ({
						value: id,
						label: PROVIDER_PRESETS[id].label,
					}))}
					value={provider.id}
					onValueChange={(v) => {
						if (v) applyProvider(v as ProviderId)
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
			<p className="text-xs text-muted-foreground">{preset.hint}</p>
			{provider.id === "custom" || provider.id === "ollama" || provider.id === "llamacpp" ? (
				<Field label="Base URL">
					<Input value={provider.baseUrl} onChange={(e) => writeField("baseUrl", e.target.value)} />
				</Field>
			) : (
				<p className="text-xs text-subtle">{provider.baseUrl}</p>
			)}
			{provider.id === "xai" ||
			provider.id === "openai" ||
			provider.id === "groq" ||
			provider.id === "openrouter" ||
			provider.id === "custom" ? (
				<Field label="API key (stored only on this device)" field="apiKey">
					<Input
						type="password"
						autoComplete="off"
						value={provider.apiKey}
						onChange={(e) => writeField("apiKey", e.target.value)}
						placeholder={provider.id === "custom" ? "Optional" : "Required — stored only on this device"}
					/>
				</Field>
			) : null}
			<ProviderModels provider={provider} />
		</div>
	)
}

function ProviderModels({ provider }: { provider: ProviderConfig }) {
	const dispatch = useApp((s) => s.dispatch)
	const [checking, setChecking] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [models, setModels] = useState<string[] | null>(null)

	const writeModel = (value: string) => {
		void (async () => {
			if (!isDesktop() && isLocalOnlyProvider(useApp.getState().settings.provider.id)) {
				await dispatch("settings.provider", { id: provider.id })
			}
			await dispatch("settings.provider", { field: "model", value })
		})()
	}

	useEffect(() => {
		let cancelled = false
		const run = (quiet: boolean) => {
			if (!quiet) setChecking(true)
			void listProviderModels({
				id: provider.id,
				model: "",
				baseUrl: provider.baseUrl,
				apiKey: provider.apiKey,
			}).then((result) => {
				if (cancelled) return
				if (!quiet) setChecking(false)
				if (!result.ok) {
					setError(result.error)
					setModels(null)
					return
				}
				setError(null)
				setModels(result.models)
				const stored = useApp.getState().settings.provider
				if (stored.id !== provider.id) return
				if (result.models.length && !result.models.includes(stored.model)) {
					void dispatch("settings.provider", { field: "model", value: result.models[0] ?? "" })
				}
			})
		}
		const id = window.setTimeout(() => run(false), 400)
		const poll =
			provider.id === "llamacpp" || provider.id === "ollama" ? window.setInterval(() => run(true), 5000) : undefined
		return () => {
			cancelled = true
			window.clearTimeout(id)
			if (poll) window.clearInterval(poll)
		}
	}, [provider.id, provider.baseUrl, provider.apiKey, dispatch])

	const options =
		provider.model && models && !models.includes(provider.model) ? [provider.model, ...models] : (models ?? [])

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<p className={error ? "text-xs text-alert" : "text-xs text-muted-foreground"}>
					{checking
						? "Checking connection…"
						: error
							? error
							: models
								? models.length
									? `Connected. ${models.length} model${models.length === 1 ? "" : "s"}.`
									: "Connected, but this provider listed no models."
								: "Not checked yet."}
				</p>
				<button
					type="button"
					className="text-xs text-muted-foreground underline decoration-border underline-offset-4 outline-none ring-inset focus-visible:ring-3 focus-visible:ring-ring/50"
					onClick={() => {
						setChecking(true)
						void listProviderModels({
							id: provider.id,
							model: "",
							baseUrl: provider.baseUrl,
							apiKey: provider.apiKey,
						}).then((result) => {
							setChecking(false)
							if (!result.ok) {
								setError(result.error)
								setModels(null)
								return
							}
							setError(null)
							setModels(result.models)
							const stored = useApp.getState().settings.provider
							if (stored.id === provider.id && result.models.length && !result.models.includes(stored.model)) {
								void dispatch("settings.provider", { field: "model", value: result.models[0] ?? "" })
							}
						})
					}}
				>
					Check again
				</button>
			</div>
			<label className="grid gap-2">
				<Label>Model</Label>
				<Select
					items={[
						{ value: "", label: checking ? "Checking…" : "Choose a model" },
						...options.map((id) => ({ value: id, label: id })),
					]}
					value={options.includes(provider.model) ? provider.model : ""}
					disabled={models === null || options.length === 0}
					onValueChange={(v) => {
						if (v != null) writeModel(v)
					}}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="">{checking ? "Checking…" : "Choose a model"}</SelectItem>
						{options.map((id) => (
							<SelectItem key={id} value={id}>
								{id}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</label>
		</div>
	)
}
