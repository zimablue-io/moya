import type { HostOs } from "./host.ts"
import { providerNeedsKey } from "./provider-models.ts"
import { resolveVoiceApiKey } from "./realtime-protocol.ts"
import {
	type HostCaps,
	PROVIDER_PRESETS,
	type ProviderConfig,
	type Settings,
	settingsForHost,
	type VoiceConfig,
	voiceRealtimeKind,
} from "./types.ts"

export type OnboardingStepId = "provider" | "voice" | "soul"

export const FIRST_RUN_LINE = "Household assistant. Voice first."

export type FirstRunVerbId = "talk" | "remember" | "today"

export type FirstRunVerb = {
	id: FirstRunVerbId
	label: string
	draft: string | null
	startsVoice: boolean
	send: boolean
}

export const FIRST_RUN_VERBS: FirstRunVerb[] = [
	{ id: "talk", label: "Talk", draft: null, startsVoice: true, send: false },
	{ id: "remember", label: "Remember this", draft: "Remember that ", startsVoice: false, send: false },
	{ id: "today", label: "What's on today", draft: "What's on today?", startsVoice: false, send: true },
]

export function isFirstRun(messages: { role: string; hidden?: boolean }[]): boolean {
	return !messages.some((m) => !m.hidden && (m.role === "user" || m.role === "assistant"))
}

export function providerSetupNeeded(provider: ProviderConfig): string | null {
	const preset = PROVIDER_PRESETS[provider.id]
	if (!preset) return "Unknown provider."
	if (provider.id === "ondevice") {
		if (!provider.model.trim()) return "Pick a GGUF."
		return null
	}
	if (!provider.baseUrl.trim()) return "Set a provider endpoint."
	if (!provider.model.trim()) return "Set a model."
	if (providerNeedsKey(provider.id) && !provider.apiKey.trim()) {
		return `Add an API key for ${preset.label}.`
	}
	return null
}

export function voiceCloudSetupNeeded(voice: VoiceConfig, provider: ProviderConfig): boolean {
	if (voice.id === "s2s") return false
	if (!voice.baseUrl.trim()) return true
	const kind = voiceRealtimeKind(voice.id, voice.baseUrl)
	if (kind !== "xai" && kind !== "openai") return false
	return !resolveVoiceApiKey(voice, provider)
}

export function onboardingNeeded(settings: Settings, caps: boolean | HostCaps): OnboardingStepId | null {
	const live = settingsForHost(settings, caps)
	if (providerSetupNeeded(live.provider)) return "provider"
	if (voiceCloudSetupNeeded(live.voiceBackend, live.provider)) return "voice"
	if (!live.brief.trim()) return "soul"
	return null
}

export function showDownloadApp(desktop: boolean): boolean {
	return !desktop
}

export function firstRunLimit(desktop: boolean, os: HostOs = "other"): string {
	if (desktop) {
		const place = os === "windows" ? "this PC" : os === "mac" ? "this Mac" : "this device"
		return `You bring the model. Keys stay on ${place}.`
	}
	return "You bring the model. Build the Mac app on this machine to keep a copy."
}

export function firstRunHint(desktop: boolean, os?: HostOs): string {
	return `${firstRunLimit(desktop, os)} Talk, or type — replies are spoken.`
}

export type MenuToolId = "memory" | "routines" | "watch" | "settings"

export function menuToolsForHost(_desktop: boolean): MenuToolId[] {
	return ["memory", "routines", "watch", "settings"]
}
