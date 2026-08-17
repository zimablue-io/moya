import { applyTranscriptBit } from "./realtime-events.ts"

export const REALTIME_SAMPLE_RATE = 24_000

export type RealtimeTool = {
	type: "function"
	name: string
	description: string
	parameters: Record<string, unknown>
}

export type TranscriptCue = {
	role: "user" | "assistant"
	text: string
	mode: "delta" | "replace" | "final"
	itemId?: string | null
}

export type LiveCaption = {
	itemId: string | null
	role: "user" | "assistant" | null
	text: string
}

export const EMPTY_LIVE_CAPTION: LiveCaption = { itemId: null, role: null, text: "" }

export const BARGE_IN_RMS = 0.045

export type FunctionCallCue = {
	callId: string
	name: string
	arguments: string
}

export function realtimeSocketUrl(baseUrl: string, model: string): string {
	const trimmed = baseUrl.trim().replace(/\/+$/, "")
	if (!trimmed) throw new Error("No voice endpoint configured.")
	const ws = trimmed.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:")
	const path = /\/realtime$/i.test(ws) ? ws : `${ws}/realtime`
	const url = new URL(path)
	const id = model.trim()
	if (id && !url.searchParams.has("model")) url.searchParams.set("model", id)
	return url.toString()
}

export function realtimeHttpBase(baseUrl: string): string {
	return baseUrl
		.trim()
		.replace(/\/+$/, "")
		.replace(/\/realtime$/i, "")
}

export function resolveVoiceApiKey(
	voice: { id: string; apiKey: string },
	provider: { id: string; apiKey: string },
): string {
	const own = voice.apiKey.trim()
	if (own) return own
	if (voice.id === provider.id && (voice.id === "xai" || voice.id === "openai")) {
		return provider.apiKey.trim()
	}
	return ""
}

export function buildSessionUpdate(opts: {
	instructions: string
	voice: string
	tools: RealtimeTool[]
	sampleRate?: number
	backend?: "s2s" | "xai" | "openai" | "custom"
}): Record<string, unknown> {
	const rate = opts.sampleRate ?? REALTIME_SAMPLE_RATE
	const backend = opts.backend ?? "s2s"
	const grok = backend === "xai"
	const openai = backend === "openai"
	const vad = openai
		? {
				type: "semantic_vad",
				eagerness: "medium",
				create_response: true,
				interrupt_response: true,
			}
		: grok
			? {
					type: "server_vad",
					threshold: 0.55,
					silence_duration_ms: 600,
					prefix_padding_ms: 333,
					create_response: true,
					interrupt_response: true,
				}
			: {
					type: "server_vad",
					silence_duration_ms: 500,
					create_response: true,
					interrupt_response: true,
				}
	const transcription = grok ? { model: "grok-transcribe" } : openai ? { model: "gpt-4o-mini-transcribe" } : undefined
	const voice = opts.voice.trim() || (backend === "s2s" ? "af_heart" : "")
	return {
		type: "session.update",
		session: {
			type: "realtime",
			instructions: opts.instructions,
			...(voice ? { voice } : {}),
			...(grok ? { turn_detection: vad, reasoning: { effort: "none" } } : {}),
			audio: {
				input: {
					format: { type: "audio/pcm", rate },
					turn_detection: vad,
					...(transcription ? { transcription } : {}),
				},
				output: {
					format: { type: "audio/pcm", rate },
					...(voice ? { voice } : {}),
				},
			},
			tools: opts.tools,
		},
	}
}

export function displayVoiceCaption(opts: { showCaptions: boolean; liveLine: string }): string {
	if (!opts.showCaptions) return ""
	return opts.liveLine.trim()
}

export {
	applyTranscriptBit,
	audioDeltaFromEvent,
	errorFromEvent,
	functionCallFromEvent,
	itemIdFromEvent,
	responseIdFromEvent,
	transcriptFromEvent,
} from "./realtime-events.ts"

export function applyLiveCaption(prev: LiveCaption, cue: TranscriptCue): LiveCaption {
	const nextId = cue.itemId ?? prev.itemId
	const newItem = Boolean(cue.itemId && prev.itemId && cue.itemId !== prev.itemId)
	const newRole = Boolean(prev.role && cue.role !== prev.role)
	const base = newItem || newRole ? "" : prev.text
	return {
		itemId: nextId,
		role: cue.role,
		text: applyTranscriptBit(base, cue.text, cue.mode),
	}
}

export function shouldSendInputAudio(_opts: { playing: boolean; micRms: number }): boolean {
	return true
}

export function shouldHonorSpeechStart(opts: { playing: boolean; micRms: number }): boolean {
	return shouldSendInputAudio(opts)
}

export type BargeInPlan = {
	flushPlayback: boolean
	cancelResponse: boolean
	truncate: { itemId: string; audioEndMs: number } | null
	ignoreUntilNewResponse: boolean
}

export function playedAudioMs(opts: { queuedMs: number; playStartedAt: number | null; now: number }): number {
	if (opts.playStartedAt == null) return 0
	const elapsedMs = Math.max(0, (opts.now - opts.playStartedAt) * 1000)
	return Math.min(Math.round(elapsedMs), Math.max(0, Math.round(opts.queuedMs)))
}

export function planBargeIn(state: {
	responseActive: boolean
	playing: boolean
	itemId: string | null
	queuedMs: number
	playStartedAt: number | null
	now: number
}): BargeInPlan {
	const hadOutput = state.responseActive || state.playing || Boolean(state.itemId)
	if (!hadOutput) {
		return { flushPlayback: false, cancelResponse: false, truncate: null, ignoreUntilNewResponse: false }
	}
	return {
		flushPlayback: true,
		cancelResponse: state.responseActive,
		truncate: state.itemId
			? {
					itemId: state.itemId,
					audioEndMs: playedAudioMs({
						queuedMs: state.queuedMs,
						playStartedAt: state.playStartedAt,
						now: state.now,
					}),
				}
			: null,
		ignoreUntilNewResponse: true,
	}
}

export function buildTruncateEvent(itemId: string, audioEndMs: number): Record<string, unknown> {
	return {
		type: "conversation.item.truncate",
		item_id: itemId,
		content_index: 0,
		audio_end_ms: Math.max(0, Math.round(audioEndMs)),
	}
}

export function shouldAcceptOutputAudio(opts: {
	ignoreUntilNewResponse: boolean
	currentResponseId: string | null
	cancelledResponseId: string | null
	eventResponseId: string | null
}): boolean {
	if (opts.ignoreUntilNewResponse) return false
	if (opts.eventResponseId && opts.cancelledResponseId && opts.eventResponseId === opts.cancelledResponseId) {
		return false
	}
	if (opts.eventResponseId && opts.currentResponseId && opts.eventResponseId !== opts.currentResponseId) {
		return false
	}
	return true
}

export function isBenignInterruptError(message: string): boolean {
	return /no (in-progress|active) response|cannot cancel|unknown.*truncat|invalid.*truncat|conversation\.item\.truncate/i.test(
		message,
	)
}

export function websocketProtocols(id: string, secret: string): string[] | undefined {
	if (!secret) return undefined
	if (id === "xai") return [`xai-client-secret.${secret}`]
	if (id === "openai") {
		return ["realtime", `openai-insecure-api-key.${secret}`, "openai-beta.realtime=v1"]
	}
	return undefined
}
