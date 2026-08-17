import { useEffect, useState } from "react"
import { Field } from "@/components/settings-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { listProviderModels } from "@/lib/llm"
import { useApp } from "@/lib/store"
import { PROVIDER_PRESETS, type ProviderId } from "@/lib/types"

export function ModelTab() {
	const settings = useApp((s) => s.settings)
	const applyProvider = useApp((s) => s.applyProvider)
	const setProviderField = useApp((s) => s.setProviderField)
	const preset = PROVIDER_PRESETS[settings.provider.id]

	return (
		<div className="space-y-4">
			<Field label="Provider" field="provider">
				<select
					className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
					value={settings.provider.id}
					onChange={(e) => applyProvider(e.target.value as ProviderId)}
				>
					{(Object.keys(PROVIDER_PRESETS) as ProviderId[]).map((id) => (
						<option key={id} value={id}>
							{PROVIDER_PRESETS[id].label}
						</option>
					))}
				</select>
			</Field>
			<p className="text-xs text-muted">{preset.hint}</p>
			{settings.provider.id === "custom" || settings.provider.id === "ollama" || settings.provider.id === "llamacpp" ? (
				<Field label="Base URL">
					<Input value={settings.provider.baseUrl} onChange={(e) => setProviderField("baseUrl", e.target.value)} />
				</Field>
			) : (
				<p className="text-xs text-subtle">{settings.provider.baseUrl}</p>
			)}
			{settings.provider.id === "xai" ||
			settings.provider.id === "openai" ||
			settings.provider.id === "groq" ||
			settings.provider.id === "openrouter" ||
			settings.provider.id === "custom" ? (
				<Field label="API key (stored only on this device)" field="apiKey">
					<Input
						type="password"
						autoComplete="off"
						value={settings.provider.apiKey}
						onChange={(e) => setProviderField("apiKey", e.target.value)}
						placeholder={settings.provider.id === "custom" ? "Optional" : "Required — stored only on this device"}
					/>
				</Field>
			) : null}
			<ProviderModels />
		</div>
	)
}

function ProviderModels() {
	const provider = useApp((s) => s.settings.provider)
	const setProviderField = useApp((s) => s.setProviderField)
	const [checking, setChecking] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [models, setModels] = useState<string[] | null>(null)

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
				const current = useApp.getState().settings.provider.model
				if (result.models.length && !result.models.includes(current)) {
					setProviderField("model", result.models[0] ?? "")
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
	}, [provider.id, provider.baseUrl, provider.apiKey, setProviderField])

	const options =
		provider.model && models && !models.includes(provider.model) ? [provider.model, ...models] : (models ?? [])

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<p className={error ? "text-xs text-alert" : "text-xs text-muted"}>
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
					className="text-xs text-muted underline decoration-border underline-offset-4"
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
							const current = useApp.getState().settings.provider.model
							if (result.models.length && !result.models.includes(current)) {
								setProviderField("model", result.models[0] ?? "")
							}
						})
					}}
				>
					Check again
				</button>
			</div>
			<label className="grid gap-2">
				<Label>Model</Label>
				<select
					className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
					value={options.includes(provider.model) ? provider.model : ""}
					disabled={models === null || options.length === 0}
					onChange={(e) => setProviderField("model", e.target.value)}
				>
					<option value="">{checking ? "Checking…" : "Choose a model"}</option>
					{options.map((id) => (
						<option key={id} value={id}>
							{id}
						</option>
					))}
				</select>
			</label>
		</div>
	)
}
