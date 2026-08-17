import { Info, Play, Square } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { authEnabled } from "@/lib/auth/client"
import { UserButton } from "@/lib/auth/gates"
import { APP_NAME, openSettingsToAllow } from "@/lib/brand"
import { isDesktop, systemSettingsLabel, thisDeviceLabel } from "@/lib/host"
import { listProviderModels } from "@/lib/llm"
import { allowMicrophone, type MediaAuth, mediaPermissionStatus } from "@/lib/media-permission"
import { speech } from "@/lib/speech"
import { useApp } from "@/lib/store"
import {
	PROVIDER_PRESETS,
	type ProviderId,
	speakersFor,
	VOICE_CHOICES,
	VOICE_PRESETS,
	type VoiceBackendId,
} from "@/lib/types"
import { uid } from "@/lib/utils"
import { resolveVoiceApiKey, voiceBackendNeedsKey } from "@/lib/voice-backend"
import { listRealtimeSpeakers, type SpeakerOption } from "@/lib/voice-catalog"
import { VOICE_SETTINGS_COPY } from "@/lib/voice-contract"
import { restartVoiceIfNeeded } from "@/lib/voice-mode"

export function SettingsDialog() {
	const dialog = useApp((s) => s.dialog)
	const openDialog = useApp((s) => s.openDialog)
	const settings = useApp((s) => s.settings)
	const patch = useApp((s) => s.patchSettings)
	const applyProvider = useApp((s) => s.applyProvider)
	const setProviderField = useApp((s) => s.setProviderField)
	const applyVoiceBackend = useApp((s) => s.applyVoiceBackend)
	const setVoiceBackendField = useApp((s) => s.setVoiceBackendField)
	const mcpServers = useApp((s) => s.mcpServers)
	const addMcp = useApp((s) => s.addMcp)
	const removeMcp = useApp((s) => s.removeMcp)
	const toggleMcp = useApp((s) => s.toggleMcp)
	const testMcp = useApp((s) => s.testMcp)
	const wipe = useApp((s) => s.wipe)
	const exportJson = useApp((s) => s.exportJson)
	const importJson = useApp((s) => s.importJson)

	const [mcpName, setMcpName] = useState("")
	const [mcpUrl, setMcpUrl] = useState("")
	const [mcpAuth, setMcpAuth] = useState("")
	const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
	const [previewing, setPreviewing] = useState(false)
	const previewingRef = useRef(false)
	const previewGen = useRef(0)
	const preset = PROVIDER_PRESETS[settings.provider.id]
	const setPresence = useApp((s) => s.setPresence)
	const voiceMode = useApp((s) => s.voiceMode)

	useEffect(() => {
		const load = () => setVoices(speech.listVoices())
		load()
		window.speechSynthesis?.addEventListener("voiceschanged", load)
		return () => window.speechSynthesis?.removeEventListener("voiceschanged", load)
	}, [])

	useEffect(() => {
		if (dialog === "settings") return
		if (!previewingRef.current) return
		previewGen.current += 1
		speech.stopSpeak()
		previewingRef.current = false
		setPreviewing(false)
		setPresence({ presence: voiceMode ? "listening" : "idle" })
	}, [dialog, setPresence, voiceMode])

	const playVoicePreview = (override?: { voiceURI?: string; rate?: number; pitch?: number }) => {
		if (!speech.ttsSupported) return
		const gen = ++previewGen.current
		previewingRef.current = true
		setPreviewing(true)
		setPresence({ presence: "speaking" })
		speech.previewVoice({
			voiceURI: override?.voiceURI ?? settings.voiceURI,
			rate: override?.rate ?? settings.rate,
			pitch: override?.pitch ?? settings.pitch,
			onEnd: () => {
				if (previewGen.current !== gen) return
				previewingRef.current = false
				setPreviewing(false)
			},
		})
	}

	const stopVoicePreview = () => {
		if (!previewingRef.current) return
		previewGen.current += 1
		speech.stopSpeak()
		previewingRef.current = false
		setPreviewing(false)
		setPresence({ presence: voiceMode ? "listening" : "idle" })
	}

	return (
		<Dialog open={dialog === "settings"} onOpenChange={(o) => openDialog(o ? "settings" : null)}>
			<DialogContent className="grid-rows-[auto_1fr] sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>Name, voice, and which model talks.</DialogDescription>
				</DialogHeader>
				<Tabs defaultValue="general" className="min-h-0">
					<TabsList>
						<TabsTrigger value="general">General</TabsTrigger>
						<TabsTrigger value="voice">Voice</TabsTrigger>
						<TabsTrigger value="model">Model</TabsTrigger>
						<TabsTrigger value="tools">Tools</TabsTrigger>
						<TabsTrigger value="data">Data</TabsTrigger>
					</TabsList>
					<ScrollArea className="h-[min(52dvh,28rem)] pr-2">
						<TabsContent value="general" className="space-y-4">
							<Field label="Assistant name">
								<Input value={settings.agentName} onChange={(e) => patch({ agentName: e.target.value })} />
							</Field>
							<Field label="What to call you">
								<Input value={settings.userName} onChange={(e) => patch({ userName: e.target.value })} />
							</Field>
							<Field label="Standing brief">
								<Textarea
									value={settings.brief}
									onChange={(e) => patch({ brief: e.target.value })}
									placeholder="How you work, what to watch, what not to do."
								/>
							</Field>
							{authEnabled ? (
								<div className="rounded-xl bg-surface-2 p-3">
									<p className="mb-2 text-xs text-muted">Account</p>
									<UserButton />
								</div>
							) : null}
						</TabsContent>
						<TabsContent value="voice" className="space-y-4">
							<MicAccess />
							<div className="flex flex-wrap items-center gap-x-6 gap-y-2">
								<label className="flex h-8 items-center gap-2 text-sm">
									<Switch checked={settings.autoSpeak} onCheckedChange={(v) => patch({ autoSpeak: v })} />
									Speak typed replies
								</label>
								<label className="flex h-8 items-center gap-2 text-sm">
									<Switch checked={settings.showCaptions} onCheckedChange={(v) => patch({ showCaptions: v })} />
									Captions
								</label>
							</div>
							<Field label="Provider" tip={VOICE_PRESETS[settings.voiceBackend.id].hint}>
								<select
									className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
									value={VOICE_CHOICES.includes(settings.voiceBackend.id) ? settings.voiceBackend.id : "s2s"}
									onChange={(e) => {
										applyVoiceBackend(e.target.value as VoiceBackendId)
										if (useApp.getState().voiceMode) void restartVoiceIfNeeded()
									}}
								>
									{VOICE_CHOICES.map((id) => (
										<option key={id} value={id}>
											{VOICE_PRESETS[id].label}
										</option>
									))}
								</select>
							</Field>
							<SpokenVoice
								id={settings.voiceBackend.id}
								baseUrl={settings.voiceBackend.baseUrl}
								apiKey={resolveVoiceApiKey(settings.voiceBackend, settings.provider)}
								value={settings.voiceBackend.voice}
								onChange={(v) => setVoiceBackendField("voice", v)}
								onCommit={() => {
									if (useApp.getState().voiceMode) void restartVoiceIfNeeded()
								}}
							/>
							{voiceBackendNeedsKey(settings.voiceBackend.id) ? (
								<Field label="API key">
									<Input
										type="password"
										autoComplete="off"
										value={settings.voiceBackend.apiKey}
										onChange={(e) => setVoiceBackendField("apiKey", e.target.value)}
										placeholder={settings.provider.id === settings.voiceBackend.id ? "Same as Model" : "Required"}
									/>
								</Field>
							) : null}
							{settings.voiceBackend.id === "s2s" ? (
								<details className="rounded-xl bg-surface-2 px-3 py-2">
									<summary className="cursor-pointer text-xs text-muted">Connection</summary>
									<div className="mt-3 grid gap-3">
										<Field label="URL">
											<Input
												value={settings.voiceBackend.baseUrl}
												onChange={(e) => setVoiceBackendField("baseUrl", e.target.value)}
												placeholder="http://127.0.0.1:8765/v1"
											/>
										</Field>
									</div>
								</details>
							) : null}
							{settings.autoSpeak ? (
								<details className="rounded-xl bg-surface-2 px-3 py-2">
									<summary className="cursor-pointer text-xs text-muted">Typed replies</summary>
									<div className="mt-3 grid gap-3">
										<Field label={VOICE_SETTINGS_COPY.typedSpeaker} tip={VOICE_SETTINGS_COPY.typedTip}>
											<MacVoicePicker
												voices={voices}
												value={settings.voiceURI}
												previewing={previewing}
												onVoice={(voiceURI) => {
													patch({ voiceURI })
													playVoicePreview({ voiceURI })
												}}
												onPreview={() => playVoicePreview()}
												onStop={stopVoicePreview}
											/>
										</Field>
										<Field label={`Rate ${settings.rate.toFixed(2)}`}>
											<Slider
												min={0.7}
												max={1.3}
												step={0.05}
												value={[settings.rate]}
												onValueChange={([v]) => patch({ rate: v ?? 1 })}
												onValueCommit={([v]) => playVoicePreview({ rate: v ?? 1 })}
											/>
										</Field>
										<Field label={`Pitch ${settings.pitch.toFixed(2)}`}>
											<Slider
												min={0.7}
												max={1.3}
												step={0.05}
												value={[settings.pitch]}
												onValueChange={([v]) => patch({ pitch: v ?? 1 })}
												onValueCommit={([v]) => playVoicePreview({ pitch: v ?? 1 })}
											/>
										</Field>
									</div>
								</details>
							) : null}
						</TabsContent>
						<TabsContent value="model" className="space-y-4">
							<Field label="Provider">
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
							{settings.provider.id === "custom" ||
							settings.provider.id === "ollama" ||
							settings.provider.id === "llamacpp" ? (
								<Field label="Base URL">
									<Input
										value={settings.provider.baseUrl}
										onChange={(e) => setProviderField("baseUrl", e.target.value)}
									/>
								</Field>
							) : (
								<p className="text-xs text-subtle">{settings.provider.baseUrl}</p>
							)}
							{settings.provider.id === "xai" ||
							settings.provider.id === "openai" ||
							settings.provider.id === "groq" ||
							settings.provider.id === "openrouter" ||
							settings.provider.id === "custom" ? (
								<Field label="API key (stored only on this device)">
									<Input
										type="password"
										autoComplete="off"
										value={settings.provider.apiKey}
										onChange={(e) => setProviderField("apiKey", e.target.value)}
										placeholder={
											settings.provider.id === "custom" ? "Optional" : "Required — stored only on this device"
										}
									/>
								</Field>
							) : null}
							<ProviderModels />
						</TabsContent>
						<TabsContent value="tools" className="space-y-4">
							<p className="text-xs text-muted">
								One assistant. Tools come from MCP servers your projects already expose. If a capability is missing,
								that is a gap in that project.
							</p>
							<div className="grid gap-2 sm:grid-cols-2">
								<Input placeholder="Name" value={mcpName} onChange={(e) => setMcpName(e.target.value)} />
								<Input placeholder="https://host/mcp" value={mcpUrl} onChange={(e) => setMcpUrl(e.target.value)} />
								<Input
									className="sm:col-span-2"
									placeholder="Authorization header (optional)"
									value={mcpAuth}
									onChange={(e) => setMcpAuth(e.target.value)}
								/>
							</div>
							<Button
								variant="outline"
								disabled={!mcpName.trim() || !mcpUrl.trim()}
								onClick={() => {
									addMcp({
										id: uid("mcp"),
										name: mcpName.trim(),
										url: mcpUrl.trim(),
										authHeader: mcpAuth.trim(),
										enabled: true,
									})
									setMcpName("")
									setMcpUrl("")
									setMcpAuth("")
								}}
							>
								Add server
							</Button>
							<ul className="flex flex-col gap-2">
								{mcpServers.length === 0 ? (
									<li className="text-sm text-muted">
										No servers yet. Built-in tools still work: memory, boards, time, inbox, visuals.
									</li>
								) : (
									mcpServers.map((s) => (
										<li key={s.id} className="rounded-xl bg-surface-2 p-3">
											<div className="flex items-start justify-between gap-3">
												<div>
													<p className="text-sm font-medium text-fg">{s.name}</p>
													<p className="text-xs break-all text-muted">{s.url}</p>
													<p className="mt-1 text-xs text-subtle">
														{(s.tools ?? []).length} tools
														{s.lastError ? ` · ${s.lastError}` : s.lastOkAt ? " · connected" : ""}
													</p>
												</div>
												<div className="flex items-center gap-2">
													<Switch checked={s.enabled} onCheckedChange={() => toggleMcp(s.id)} />
													<Button size="sm" variant="outline" onClick={() => void testMcp(s.id)}>
														Test
													</Button>
													<Button size="sm" variant="ghost" onClick={() => removeMcp(s.id)}>
														Remove
													</Button>
												</div>
											</div>
										</li>
									))
								)}
							</ul>
						</TabsContent>
						<TabsContent value="data" className="space-y-4">
							<p className="text-sm text-muted">
								Transcripts, memory, boards, and keys live in a SQL database on this device. Nothing is stored on a{" "}
								{APP_NAME} server.
							</p>
							<p className="text-xs text-muted">
								Export is a private backup of this device, including API keys and MCP headers. Keep the file to
								yourself.
							</p>
							<div className="flex flex-wrap gap-2">
								<Button
									variant="outline"
									onClick={() => {
										const blob = new Blob([exportJson()], { type: "application/json" })
										const url = URL.createObjectURL(blob)
										const a = document.createElement("a")
										a.href = url
										a.download = "moya-local.json"
										a.click()
										URL.revokeObjectURL(url)
									}}
								>
									Export
								</Button>
								<Button
									variant="outline"
									onClick={() => {
										const input = document.createElement("input")
										input.type = "file"
										input.accept = "application/json"
										input.onchange = async () => {
											const file = input.files?.[0]
											if (!file) return
											importJson(await file.text())
										}
										input.click()
									}}
								>
									Import
								</Button>
								<Button
									variant="danger"
									onClick={() => {
										if (!window.confirm("Wipe this device? Transcripts, memory, boards, and keys will be deleted.")) {
											return
										}
										void wipe()
									}}
								>
									Wipe this device
								</Button>
							</div>
						</TabsContent>
					</ScrollArea>
				</Tabs>
			</DialogContent>
		</Dialog>
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

function MicAccess() {
	const dialog = useApp((s) => s.dialog)
	const [auth, setAuth] = useState<MediaAuth | null>(null)
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		if (dialog !== "settings") return
		const refresh = () => void mediaPermissionStatus().then(setAuth)
		refresh()
		window.addEventListener("focus", refresh)
		return () => window.removeEventListener("focus", refresh)
	}, [dialog])

	const mic = auth?.microphone ?? "prompt"
	const speechAuth = auth?.speech ?? "prompt"
	const allowed = mic === "granted" && speechAuth !== "denied"
	const blocked = mic === "denied" || mic === "restricted" || speechAuth === "denied"

	if (!auth || allowed) {
		return allowed ? <p className="text-xs text-muted">Microphone allowed</p> : null
	}

	return (
		<div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
			<div className="min-w-0">
				<p className="text-sm text-fg">{blocked ? "Microphone blocked" : "Microphone not allowed yet"}</p>
				<p className="text-xs text-muted">
					{isDesktop()
						? blocked
							? openSettingsToAllow(systemSettingsLabel())
							: `${thisDeviceLabel()} will ask the first time you allow it.`
						: blocked
							? "Use the control in the address bar."
							: "The browser will ask the first time you allow it."}
				</p>
			</div>
			<Button
				size="sm"
				variant="outline"
				className="shrink-0"
				disabled={busy}
				onClick={() => {
					setBusy(true)
					void allowMicrophone()
						.then(() => mediaPermissionStatus())
						.then(setAuth)
						.finally(() => setBusy(false))
				}}
			>
				{blocked && isDesktop() ? `Open ${systemSettingsLabel()}` : "Allow microphone"}
			</Button>
		</div>
	)
}

function SpokenVoice({
	id,
	baseUrl,
	apiKey,
	value,
	onChange,
	onCommit,
}: {
	id: VoiceBackendId
	baseUrl: string
	apiKey: string
	value: string
	onChange: (v: string) => void
	onCommit?: () => void
}) {
	const [speakers, setSpeakers] = useState<SpeakerOption[]>(() => speakersFor(id))
	useEffect(() => {
		let cancelled = false
		setSpeakers(speakersFor(id))
		void listRealtimeSpeakers({ id, baseUrl, apiKey }, { fallback: speakersFor(id) }).then((list) => {
			if (!cancelled && list.length) setSpeakers(list)
		})
		return () => {
			cancelled = true
		}
	}, [id, baseUrl, apiKey])

	const named = speakers
	if (!named.length) {
		return (
			<Field label={VOICE_SETTINGS_COPY.conversationSpeaker}>
				<Input
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onBlur={() => onCommit?.()}
					placeholder="af_heart"
				/>
			</Field>
		)
	}
	const known = named.some((v) => v.id === value)
	const selected = known ? value : value ? "__other__" : (named[0]?.id ?? "")
	const groups = speakerGroups(named)
	return (
		<Field
			label={VOICE_SETTINGS_COPY.conversationSpeaker}
			tip={id === "s2s" ? VOICE_SETTINGS_COPY.conversationTipLocal : id === "xai" ? "Live list from xAI." : undefined}
		>
			<select
				className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
				value={selected}
				onChange={(e) => {
					if (e.target.value === "__other__") return
					onChange(e.target.value)
					onCommit?.()
				}}
			>
				{groups.map((group) =>
					group.name ? (
						<optgroup key={group.name} label={group.name}>
							{group.items.map((v) => (
								<option key={v.id} value={v.id}>
									{v.label}
								</option>
							))}
						</optgroup>
					) : (
						group.items.map((v) => (
							<option key={v.id} value={v.id}>
								{v.label}
							</option>
						))
					),
				)}
				{!known && value ? <option value="__other__">{value}</option> : null}
			</select>
		</Field>
	)
}

function speakerGroups(speakers: SpeakerOption[]): { name: string; items: SpeakerOption[] }[] {
	const groups: { name: string; items: SpeakerOption[] }[] = []
	const index = new Map<string, SpeakerOption[]>()
	for (const speaker of speakers) {
		const name = speaker.group ?? ""
		let items = index.get(name)
		if (!items) {
			items = []
			index.set(name, items)
			groups.push({ name, items })
		}
		items.push(speaker)
	}
	return groups
}

function MacVoicePicker({
	voices,
	value,
	previewing,
	onVoice,
	onPreview,
	onStop,
}: {
	voices: SpeechSynthesisVoice[]
	value: string
	previewing: boolean
	onVoice: (voiceURI: string) => void
	onPreview: () => void
	onStop: () => void
}) {
	return (
		<div className="flex gap-2">
			<select
				id="voice-select"
				className="h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm"
				value={value}
				onChange={(e) => onVoice(e.target.value)}
			>
				<option value="">System default</option>
				{value && !voices.some((v) => v.voiceURI === value) ? <option value={value}>Saved voice</option> : null}
				{voices.map((v) => (
					<option key={v.voiceURI} value={v.voiceURI}>
						{v.name} ({v.lang})
					</option>
				))}
			</select>
			<Button
				type="button"
				variant="outline"
				size="icon"
				className="shrink-0"
				disabled={!speech.ttsSupported}
				aria-pressed={previewing}
				aria-label={previewing ? "Stop preview" : "Hear this voice"}
				onClick={() => (previewing ? onStop() : onPreview())}
			>
				{previewing ? <Square className="size-4" /> : <Play className="size-4" />}
			</Button>
		</div>
	)
}

function Field({ label, tip, children }: { label: string; tip?: string; children: ReactNode }) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center gap-0.5">
				<Label>{label}</Label>
				{tip ? <InfoTip text={tip} /> : null}
			</div>
			{children}
		</div>
	)
}

function InfoTip({ text }: { text: string }) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="inline-flex size-7 items-center justify-center rounded-full text-subtle hover:bg-surface-2 hover:text-fg"
					aria-label="About this setting"
				>
					<Info className="size-3.5" />
				</button>
			</PopoverTrigger>
			<PopoverContent>{text}</PopoverContent>
		</Popover>
	)
}
