import type { FunctionCallCue, TranscriptCue } from "./realtime-protocol.ts"

export function audioDeltaFromEvent(event: Record<string, unknown>): string | null {
	const type = String(event.type ?? "")
	if (type !== "response.output_audio.delta" && type !== "response.audio.delta") return null
	if (typeof event.delta === "string" && event.delta) return event.delta
	if (typeof event.audio === "string" && event.audio) return event.audio
	return null
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
