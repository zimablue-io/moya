import { useEffect, useState } from "react"
import { Field } from "@/components/settings-field"
import { MacVoicePicker, SpokenVoice } from "@/components/settings-speakers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { openSettingsToAllow } from "@/lib/brand"
import { isDesktop, systemSettingsLabel, thisDeviceLabel } from "@/lib/host"
import { allowMicrophone, type MediaAuth, mediaPermissionStatus } from "@/lib/media-permission"
import { useApp } from "@/lib/store"
import { VOICE_CHOICES, VOICE_PRESETS, type VoiceBackendId } from "@/lib/types"
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
			<Field label="Provider" field="voice" tip={VOICE_PRESETS[settings.voiceBackend.id].hint}>
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
								value={[settings.rate]}
								onValueChange={([v]) => patch({ rate: v ?? 1 })}
								onValueCommit={([v]) => onPreview({ rate: v ?? 1 })}
							/>
						</Field>
						<Field label={`Pitch ${settings.pitch.toFixed(2)}`}>
							<Slider
								min={0.7}
								max={1.3}
								step={0.05}
								value={[settings.pitch]}
								onValueChange={([v]) => patch({ pitch: v ?? 1 })}
								onValueCommit={([v]) => onPreview({ pitch: v ?? 1 })}
							/>
						</Field>
					</div>
				</details>
			) : null}
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
