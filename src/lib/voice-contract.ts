import { buildSessionUpdate, type RealtimeTool, realtimeHttpBase } from "./realtime-protocol.ts"
import {
	localConversationVoice,
	type PresenceState,
	type Settings,
	speakersFor,
	VOICE_PRESETS,
	type VoiceBackendId,
} from "./types.ts"

/** Settings copy. One provider, one speaker. */
export const VOICE_SETTINGS_COPY = {
	conversationSpeaker: "Speaker",
	conversationTipLocal: "Kokoro ids such as af_heart. The sidecar has no /v1/voices list.",
} as const

export { voiceUrlIsEditable, voiceUsesRealtime } from "./types.ts"

export function conversationVoice(settings: Pick<Settings, "voiceBackend">): string {
	if (settings.voiceBackend.id === "browser") return ""
	const stored = settings.voiceBackend.voice.trim()
	if (settings.voiceBackend.id === "s2s") return localConversationVoice(stored)
	if (stored) return stored
	return VOICE_PRESETS[settings.voiceBackend.id]?.voice || "af_heart"
}

export function typedReplyVoice(settings: Pick<Settings, "voiceURI">): string {
	return settings.voiceURI
}

export function sessionUpdateFromSettings(
	settings: Settings,
	opts?: { instructions?: string; tools?: RealtimeTool[] },
): Record<string, unknown> {
	const id = settings.voiceBackend.id
	const backend = id === "xai" || id === "openai" || id === "custom" ? id : "s2s"
	return buildSessionUpdate({
		backend,
		instructions: opts?.instructions ?? "",
		voice: conversationVoice(settings),
		tools: opts?.tools ?? [],
	})
}

export function realtimeConnectFromSettings(settings: Settings): {
	id: VoiceBackendId
	baseUrl: string
	model: string
	voice: string
} {
	return {
		id: settings.voiceBackend.id,
		baseUrl: settings.voiceBackend.baseUrl,
		model: settings.voiceBackend.model,
		voice: conversationVoice(settings),
	}
}

export function sessionOutputVoice(event: Record<string, unknown>): string | undefined {
	const session = event.session
	if (!session || typeof session !== "object") return undefined
	const rec = session as {
		voice?: unknown
		audio?: { output?: { voice?: unknown } }
	}
	const nested = rec.audio?.output?.voice
	if (typeof nested === "string" && nested) return nested
	if (typeof rec.voice === "string" && rec.voice) return rec.voice
	return undefined
}

export function browserSpeechFinalSink(opts: {
	voiceMode: boolean
	noteListen: boolean
	backend?: VoiceBackendId
}): "note" | "ignore" | "hold" | "send" {
	if (opts.noteListen) return "note"
	if (opts.voiceMode && opts.backend === "browser") return "send"
	if (opts.voiceMode) return "ignore"
	return "hold"
}

export function shouldStartHoldListen(opts: {
	voiceMode: boolean
	presence: PresenceState
	noteListen: boolean
}): boolean {
	return !opts.voiceMode && opts.presence !== "thinking" && !opts.noteListen
}

export function shouldSpeakTypedReply(opts: {
	autoSpeak: boolean
	voiceMode: boolean
	backend?: VoiceBackendId
}): boolean {
	if (opts.backend === "browser" && opts.voiceMode) return true
	return opts.autoSpeak && !opts.voiceMode
}

export function shouldExitVoiceForComposer(voiceMode: boolean): boolean {
	return voiceMode
}

export type VoiceSessionUi = {
	voiceMode: boolean
	presence: PresenceState
	error: string | null
}

export function voiceUiAfterConnectError(message: string): VoiceSessionUi {
	return { voiceMode: false, presence: "idle", error: message }
}

export function voiceUiAfterUnexpectedClose(ui: VoiceSessionUi): VoiceSessionUi {
	if (!ui.voiceMode) return ui
	const busy = ui.presence === "listening" || ui.presence === "thinking" || ui.presence === "speaking"
	return { voiceMode: false, presence: busy ? "idle" : ui.presence, error: ui.error }
}

export function connectFailureMessage(baseUrl: string): string {
	const host = realtimeHttpBase(baseUrl)
	if (/127\.0\.0\.1|localhost/i.test(host)) {
		return `Nothing is listening at ${host}. Start speech-to-speech, then tap Voice again.`
	}
	return "Could not reach the voice backend. Check the URL and key."
}

export function conversationSpeakerOptions(id: VoiceBackendId) {
	return speakersFor(id)
}
