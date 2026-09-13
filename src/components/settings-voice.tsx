import { useEffect, useState } from "react"
import { Field } from "@/components/settings-field"
import { SpokenVoice } from "@/components/settings-speakers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { openSettingsToAllow } from "@/lib/brand"
import { hostCaps, isDesktop, systemSettingsLabel, thisDeviceLabel } from "@/lib/host"
import { allowMicrophone, type MediaAuth, mediaPermissionStatus } from "@/lib/media-permission"
import { useApp } from "@/lib/store"
import {
	VOICE_PRESETS,
	type VoiceBackendId,
	voiceBackendForHost,
	voiceChoicesForHost,
	voiceRealtimeKind,
	voiceUrlIsEditable,
} from "@/lib/types"
import { resolveVoiceApiKey, voiceBackendNeedsKey } from "@/lib/voice-backend"
import { restartVoiceIfNeeded } from "@/lib/voice-mode"

export function VoiceTab() {
	const settings = useApp((s) => s.settings)
	const patch = useApp((s) => s.patchSettings)
	const applyVoiceBackend = useApp((s) => s.applyVoiceBackend)
	const setVoiceBackendField = useApp((s) => s.setVoiceBackendField)
	const caps = hostCaps()
	const choices = voiceChoicesForHost(caps)
	const live = voiceBackendForHost(settings.voiceBackend, caps)
	const id = choices.includes(live.id) ? live.id : (choices[0] ?? "custom")
	const preset = VOICE_PRESETS[id]
	const realtimeKind = voiceRealtimeKind(id, live.baseUrl)

	return (
		<div className="flex flex-col gap-4 pt-2 pb-4">
			<MicAccess />
			<label className="flex min-h-8 items-center gap-2 py-1 text-sm">
				<Switch checked={settings.showCaptions} onCheckedChange={(v) => patch({ showCaptions: v })} />
				Captions
			</label>
			{choices.length > 1 ? (
				<Field label="Provider" field="voice">
					<Select
						items={choices.map((choice) => ({
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
							{choices.map((choice) => (
								<SelectItem key={choice} value={choice}>
									{VOICE_PRESETS[choice].label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
			) : null}
			<p className="text-xs text-muted-foreground">{preset.hint}</p>
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
			{id === "custom" ? (
				<Field label="Realtime model">
					<Input
						value={settings.voiceBackend.model}
						onChange={(e) => setVoiceBackendField("model", e.target.value)}
						placeholder={
							realtimeKind === "xai" ? "grok-voice-latest" : realtimeKind === "openai" ? "gpt-realtime" : "local"
						}
					/>
				</Field>
			) : null}
			{id === "custom" || voiceBackendNeedsKey(live) ? (
				<Field label="API key (stored only on this device)" field="apiKey">
					<Input
						type="password"
						autoComplete="off"
						value={settings.voiceBackend.apiKey}
						onChange={(e) => setVoiceBackendField("apiKey", e.target.value)}
						placeholder={
							voiceBackendNeedsKey(live)
								? "Required — stored only on this device"
								: "Optional — stored only on this device"
						}
					/>
				</Field>
			) : null}
			<SpokenVoice
				id={id}
				baseUrl={live.baseUrl}
				apiKey={resolveVoiceApiKey(live, settings.provider)}
				model={live.model}
				value={live.voice}
				onChange={async (v) => {
					await setVoiceBackendField("voice", v)
				}}
				onCommit={async () => {
					if (useApp.getState().voiceMode) await restartVoiceIfNeeded()
				}}
			/>
		</div>
	)
}

function MicAccess() {
	const [auth, setAuth] = useState<MediaAuth | null>(null)
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		const refresh = () => void mediaPermissionStatus().then(setAuth)
		refresh()
		window.addEventListener("focus", refresh)
		return () => window.removeEventListener("focus", refresh)
	}, [])

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
