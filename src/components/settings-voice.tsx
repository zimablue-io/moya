import { useEffect, useState } from "react"
import { Field } from "@/components/settings-field"
import { SpokenVoice, SystemVoicePicker } from "@/components/settings-speakers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { openSettingsToAllow } from "@/lib/brand"
import { isDesktop, systemSettingsLabel, thisDeviceLabel } from "@/lib/host"
import { allowMicrophone, type MediaAuth, mediaPermissionStatus } from "@/lib/media-permission"
import { useApp } from "@/lib/store"
import { VOICE_CHOICES, VOICE_PRESETS, type VoiceBackendId, voiceUrlIsEditable } from "@/lib/types"
import { resolveVoiceApiKey, voiceBackendNeedsKey } from "@/lib/voice-backend"
import { VOICE_SETTINGS_COPY } from "@/lib/voice-contract"
import { restartVoiceIfNeeded } from "@/lib/voice-mode"

export function VoiceTab({
	voices,
	previewing,
	onPreview,
	onStop,
}: {
	voices: SpeechSynthesisVoice[]
	previewing: boolean
	onPreview: (override?: { voiceURI?: string; rate?: number; pitch?: number }) => void
	onStop: () => void
}) {
	const settings = useApp((s) => s.settings)
	const patch = useApp((s) => s.patchSettings)
	const applyVoiceBackend = useApp((s) => s.applyVoiceBackend)
	const setVoiceBackendField = useApp((s) => s.setVoiceBackendField)
	const id = VOICE_CHOICES.includes(settings.voiceBackend.id) ? settings.voiceBackend.id : "s2s"
	const preset = VOICE_PRESETS[id]

	return (
		<div className="space-y-4">
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
			<Field label="Provider" field="voice">
				<Select
					items={VOICE_CHOICES.map((choice) => ({
						value: choice,
						label: VOICE_PRESETS[choice].label,
					}))}
					value={id}
					onValueChange={(v) => {
						if (!v) return
						void (async () => {
							await applyVoiceBackend(v as VoiceBackendId)
							if (useApp.getState().voiceMode) await restartVoiceIfNeeded()
						})()
					}}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{VOICE_CHOICES.map((choice) => (
							<SelectItem key={choice} value={choice}>
								{VOICE_PRESETS[choice].label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<p className="text-xs text-muted-foreground">{preset.hint}</p>
			{id === "browser" ? (
				<>
					<Field label={VOICE_SETTINGS_COPY.conversationSpeaker}>
						<SystemVoicePicker
							voices={voices}
							value={settings.voiceURI}
							previewing={previewing}
							onVoice={(voiceURI) => {
								patch({ voiceURI })
								onPreview({ voiceURI })
							}}
							onPreview={() => onPreview()}
							onStop={onStop}
						/>
					</Field>
					<Field label={`Rate ${settings.rate.toFixed(2)}`}>
						<Slider
							min={0.7}
							max={1.3}
							step={0.05}
							value={settings.rate}
							onValueChange={(v) => patch({ rate: typeof v === "number" ? v : (v[0] ?? 1) })}
							onValueCommitted={(v) => onPreview({ rate: typeof v === "number" ? v : (v[0] ?? 1) })}
						/>
					</Field>
					<Field label={`Pitch ${settings.pitch.toFixed(2)}`}>
						<Slider
							min={0.7}
							max={1.3}
							step={0.05}
							value={settings.pitch}
							onValueChange={(v) => patch({ pitch: typeof v === "number" ? v : (v[0] ?? 1) })}
							onValueCommitted={(v) => onPreview({ pitch: typeof v === "number" ? v : (v[0] ?? 1) })}
						/>
					</Field>
				</>
			) : (
				<>
					{voiceUrlIsEditable(id) ? (
						<Field label="Base URL">
							<Input
								value={settings.voiceBackend.baseUrl}
								onChange={(e) => setVoiceBackendField("baseUrl", e.target.value)}
								placeholder="http://127.0.0.1:8765/v1"
							/>
						</Field>
					) : (
						<p className="text-xs text-subtle">{settings.voiceBackend.baseUrl}</p>
					)}
					{voiceBackendNeedsKey(id) ? (
						<Field label="API key (stored only on this device)" field="apiKey">
							<Input
								type="password"
								autoComplete="off"
								value={settings.voiceBackend.apiKey}
								onChange={(e) => setVoiceBackendField("apiKey", e.target.value)}
								placeholder={settings.provider.id === id ? "Same as Model" : "Required — stored only on this device"}
							/>
						</Field>
					) : null}
					<SpokenVoice
						id={id}
						baseUrl={settings.voiceBackend.baseUrl}
						apiKey={resolveVoiceApiKey(settings.voiceBackend, settings.provider)}
						value={settings.voiceBackend.voice}
						onChange={async (v) => {
							await setVoiceBackendField("voice", v)
						}}
						onCommit={async () => {
							if (useApp.getState().voiceMode) await restartVoiceIfNeeded()
						}}
					/>
				</>
			)}
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
		return allowed ? <p className="text-xs text-muted-foreground">Microphone allowed</p> : null
	}

	return (
		<div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
			<div className="min-w-0">
				<p className="text-sm text-fg">{blocked ? "Microphone blocked" : "Microphone not allowed yet"}</p>
				<p className="text-xs text-muted-foreground">
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
