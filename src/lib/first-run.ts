import type { HostOs } from "./host.ts"
import { providerNeedsKey } from "./provider-models.ts"
import { resolveVoiceApiKey } from "./realtime-protocol.ts"
import { PROVIDER_PRESETS, type ProviderConfig, type VoiceConfig } from "./types.ts"

export const FIRST_RUN_LINE = "Household assistant. Stays on this device."

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
		if (!provider.model.trim()) return "Download or pick a GGUF."
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
	if (voice.id !== "xai" && voice.id !== "openai") return false
	return !resolveVoiceApiKey(voice, provider)
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
	return `${firstRunLimit(desktop, os)} Talk, type, or pick a starting line.`
}

export type MenuToolId = "history" | "memory" | "routines" | "watch" | "settings"

export function menuToolsForHost(_desktop: boolean): MenuToolId[] {
	return ["history", "memory", "routines", "watch", "settings"]
}
