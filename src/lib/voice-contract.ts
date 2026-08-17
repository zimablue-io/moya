import { buildSessionUpdate, type RealtimeTool, realtimeHttpBase } from "./realtime-protocol.ts"
import { type PresenceState, type Settings, speakersFor, VOICE_PRESETS, type VoiceBackendId } from "./types.ts"

/** Settings copy. Conversation speaker is Voice mode; Mac speaker is typed chat only. */
export const VOICE_SETTINGS_COPY = {
	conversationSpeaker: "Conversation speaker",
	conversationTipLocal:
		"Sent to the sidecar on session.update. Kokoro ids look like af_heart. Pocket names only work with Pocket TTS.",
	typedSpeaker: "Mac speaker",
	typedTip: "Only for typed chat. Voice mode uses Conversation speaker above.",
} as const

export function conversationVoice(settings: Pick<Settings, "voiceBackend">): string {
	const stored = settings.voiceBackend.voice.trim()
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
	return buildSessionUpdate({
		backend: settings.voiceBackend.id,
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

export function browserSpeechFinalSink(opts: { voiceMode: boolean; noteListen: boolean }): "note" | "ignore" | "hold" {
	if (opts.noteListen) return "note"
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

export function shouldSpeakTypedReply(opts: { autoSpeak: boolean; voiceMode: boolean }): boolean {
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
