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
	return {
		type: "session.update",
		session: {
			type: "realtime",
			instructions: opts.instructions,
			...(opts.voice ? { voice: opts.voice } : {}),
			...(grok ? { turn_detection: vad, reasoning: { effort: "none" } } : {}),
			audio: {
				input: {
					format: { type: "audio/pcm", rate },
					turn_detection: vad,
					...(transcription ? { transcription } : {}),
				},
				output: {
					format: { type: "audio/pcm", rate },
					...(opts.voice ? { voice: opts.voice } : {}),
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

export function shouldSendInputAudio(opts: { playing: boolean; micRms: number }): boolean {
	if (!opts.playing) return true
	return opts.micRms >= BARGE_IN_RMS
}

export function shouldHonorSpeechStart(opts: { playing: boolean; micRms: number }): boolean {
	return shouldSendInputAudio(opts)
}

export function audioDeltaFromEvent(event: Record<string, unknown>): string | null {
	const type = String(event.type ?? "")
	if (type !== "response.output_audio.delta" && type !== "response.audio.delta") return null
	if (typeof event.delta === "string" && event.delta) return event.delta
	if (typeof event.audio === "string" && event.audio) return event.audio
	return null
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

export function itemIdFromEvent(event: Record<string, unknown>): string | null {
	if (typeof event.item_id === "string" && event.item_id) return event.item_id
	const item = event.item
	if (item && typeof item === "object") {
		const id = (item as { id?: unknown }).id
		if (typeof id === "string" && id) return id
	}
	return null
}

export function responseIdFromEvent(event: Record<string, unknown>): string | null {
	if (typeof event.response_id === "string" && event.response_id) return event.response_id
	const response = event.response
	if (response && typeof response === "object") {
		const id = (response as { id?: unknown }).id
		if (typeof id === "string" && id) return id
	}
	return null
}

export function isBenignInterruptError(message: string): boolean {
	return /no (in-progress|active) response|cannot cancel|unknown.*truncat|invalid.*truncat|conversation\.item\.truncate/i.test(
		message,
	)
}

export function applyTranscriptBit(prev: string, incoming: string, mode: TranscriptCue["mode"]): string {
	if (mode === "replace" || mode === "final") return incoming || prev
	if (!incoming) return prev
	if (!prev) return incoming
	if (incoming.startsWith(prev) || prev.startsWith(incoming)) return incoming
	if (isCumulativeRevision(prev, incoming)) return incoming
	return prev + incoming
}

function isCumulativeRevision(prev: string, incoming: string): boolean {
	const older = transcriptWords(prev)
	const newer = transcriptWords(incoming)
	if (!older.length || !newer.length) return false
	const shared = Math.min(older.length, newer.length, 3)
	return older.slice(0, shared).every((word, i) => word === newer[i])
}

function transcriptWords(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]+/gu, " ")
		.split(/\s+/)
		.filter(Boolean)
}

export function transcriptFromEvent(event: Record<string, unknown>): TranscriptCue | null {
	const type = String(event.type ?? "")
	const text = pickTranscript(event)
	const itemId = itemIdFromEvent(event)
	const withId = <T extends TranscriptCue>(cue: T): T => (itemId ? { ...cue, itemId } : cue)
	if (type === "conversation.item.input_audio_transcription.delta") {
		return text ? withId({ role: "user", text, mode: "delta" }) : null
	}
	if (type === "conversation.item.input_audio_transcription.updated") {
		return withId({ role: "user", text, mode: "replace" })
	}
	if (type === "conversation.item.input_audio_transcription.completed") {
		return withId({ role: "user", text, mode: "final" })
	}
	if (type === "response.output_audio_transcript.delta" || type === "response.audio_transcript.delta") {
		return text ? withId({ role: "assistant", text, mode: "delta" }) : null
	}
	if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
		return withId({ role: "assistant", text, mode: "final" })
	}
	return null
}

export function functionCallFromEvent(event: Record<string, unknown>): FunctionCallCue | null {
	if (String(event.type ?? "") !== "response.function_call_arguments.done") return null
	const callId = String(event.call_id ?? event.callId ?? "")
	const name = String(event.name ?? "")
	const args = typeof event.arguments === "string" ? event.arguments : JSON.stringify(event.arguments ?? {})
	if (!callId || !name) return null
	return { callId, name, arguments: args }
}

export function errorFromEvent(event: Record<string, unknown>): string | null {
	if (String(event.type ?? "") !== "error") return null
	const nested = event.error
	if (nested && typeof nested === "object") {
		const rec = nested as Record<string, unknown>
		if (typeof rec.message === "string" && rec.message.trim()) return rec.message.trim()
	}
	if (typeof event.message === "string" && event.message.trim()) return event.message.trim()
	return "Voice backend error."
}

export function websocketProtocols(id: string, secret: string): string[] | undefined {
	if (!secret) return undefined
	if (id === "xai") return [`xai-client-secret.${secret}`]
	if (id === "openai") {
		return ["realtime", `openai-insecure-api-key.${secret}`, "openai-beta.realtime=v1"]
	}
	return undefined
}

function pickTranscript(event: Record<string, unknown>): string {
	if (typeof event.delta === "string") return event.delta
	if (typeof event.transcript === "string") return event.transcript
	if (typeof event.text === "string") return event.text
	const item = event.item
	if (item && typeof item === "object") {
		const rec = item as Record<string, unknown>
		if (typeof rec.transcript === "string") return rec.transcript
	}
	return ""
}
