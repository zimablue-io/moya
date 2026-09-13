import { useEffect, useState } from "react"
import { Field } from "@/components/settings-field"
import { OnDeviceModels } from "@/components/settings-ondevice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { hostCaps } from "@/lib/host"
import { listProviderModels } from "@/lib/llm"
import { providerNeedsKey } from "@/lib/provider-models"
import { useApp } from "@/lib/store"
import {
	isLocalOnlyProvider,
	PROVIDER_PRESETS,
	type ProviderConfig,
	type ProviderId,
	providerChoicesForHost,
	providerForHost,
} from "@/lib/types"

export function ModelTab({ onGgufBusy }: { onGgufBusy?: (busy: boolean) => void }) {
	const settings = useApp((s) => s.settings)
	const dispatch = useApp((s) => s.dispatch)
	const caps = hostCaps()
	const choices = providerChoicesForHost(caps)
	const provider = providerForHost(settings.provider, caps)
	const preset = PROVIDER_PRESETS[provider.id]
	const connections = settings.connections
	const activeId = settings.activeConnectionId
	const active = connections.find((c) => c.id === activeId) ?? connections[0]
	const [creating, setCreating] = useState(false)
	const [newName, setNewName] = useState("")
	const [newKind, setNewKind] = useState<ProviderId>(choices[0] ?? "custom")

	const writeField = (field: "baseUrl" | "apiKey", value: string) => {
		void (async () => {
			if (!caps.desktopOs && isLocalOnlyProvider(useApp.getState().settings.provider.id)) {
				await dispatch("settings.provider", { id: provider.id })
			}
			await dispatch("settings.provider", { field, value })
		})()
	}

	if (creating) {
		return (
			<div className="flex flex-col gap-4">
				<Field label="Name">
					<Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="MiniMax home" />
				</Field>
				<label className="grid gap-2">
					<Label>Provider</Label>
					<Select
						items={choices.map((id) => ({ value: id, label: PROVIDER_PRESETS[id].label }))}
						value={newKind}
						onValueChange={(v) => {
							if (v) setNewKind(v as ProviderId)
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
				</label>
				<div className="flex gap-2">
					<Button
						type="button"
						disabled={!newName.trim()}
						onClick={() => {
							const label = newName.trim()
							if (!label) return
							void dispatch("settings.connection", { add: newKind, label }).then(() => {
								setCreating(false)
								setNewName("")
							})
						}}
					>
						Save
					</Button>
					<Button
						type="button"
						variant="ghost"
						onClick={() => {
							setCreating(false)
							setNewName("")
						}}
					>
						Cancel
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-end gap-2">
				<div className="min-w-0 flex-1">
					<Field label="Connection" field="provider">
						<Select
							items={connections.map((c) => ({ value: c.id, label: c.label }))}
							value={active?.id ?? ""}
							onValueChange={(v) => {
								if (v) void dispatch("settings.connection", { id: v })
							}}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{connections.map((c) => (
									<SelectItem key={c.id} value={c.id}>
										{c.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				</div>
				<Button type="button" variant="outline" onClick={() => setCreating(true)}>
					New
				</Button>
				{active && connections.length > 1 ? (
					<Button
						type="button"
						variant="ghost"
						onClick={() => void dispatch("settings.connection", { id: active.id, remove: true })}
					>
						Remove
					</Button>
				) : null}
			</div>
			{active ? (
				<Field label="Name">
					<Input
						key={active.id}
						defaultValue={active.label}
						onBlur={(e) => {
							const name = e.target.value.trim()
							if (name && name !== active.label) {
								void dispatch("settings.connection", { id: active.id, label: name })
							}
						}}
					/>
				</Field>
			) : null}
			<p className="text-xs text-muted-foreground">{preset.hint}</p>
			<p className="text-xs text-muted-foreground">Keys stay on this device. Turns still go to this provider.</p>
			{provider.id === "custom" || isLocalOnlyProvider(provider.id) ? (
				<Field label="Base URL">
					<Input value={provider.baseUrl} onChange={(e) => writeField("baseUrl", e.target.value)} />
				</Field>
			) : provider.id === "ondevice" ? null : (
				<p className="text-xs text-subtle">{provider.baseUrl}</p>
			)}
			{providerNeedsKey(provider.id) || provider.id === "custom" ? (
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
			{provider.id === "ondevice" ? (
				<OnDeviceModels model={provider.model} onBusy={onGgufBusy} />
			) : (
				<ProviderModels provider={provider} />
			)}
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
			if (!hostCaps().desktopOs && isLocalOnlyProvider(useApp.getState().settings.provider.id)) {
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
		<div className="flex flex-col gap-3">
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
