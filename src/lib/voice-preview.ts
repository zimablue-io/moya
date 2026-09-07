import { audioDeltaFromEvent } from "./realtime-events.ts"
import { buildSessionUpdate, REALTIME_SAMPLE_RATE, realtimeSocketUrl, websocketProtocols } from "./realtime-protocol.ts"
import { type VoiceBackendId, voiceRealtimeKind } from "./types.ts"

export { VOICE_PREVIEW_TEXT } from "./brand.ts"

export type VoicePreviewTarget = {
	id: VoiceBackendId
	baseUrl: string
	apiKey: string
	model: string
	voice: string
}

export type VoicePreviewPlan = {
	url: string
	protocols: string[] | undefined
	events: Record<string, unknown>[]
}

export function realtimeModelForPreview(target: VoicePreviewTarget): string {
	if (target.model.trim()) return target.model.trim()
	const kind = voiceRealtimeKind(target.id, target.baseUrl)
	if (kind === "s2s") return "local"
	if (kind === "xai") return "grok-voice-latest"
	if (kind === "openai") return "gpt-realtime"
	return ""
}

export function voicePreviewPlan(target: VoicePreviewTarget, text: string): VoicePreviewPlan {
	const kind = voiceRealtimeKind(target.id, target.baseUrl)
	return {
		url: realtimeSocketUrl(target.baseUrl, realtimeModelForPreview(target)),
		protocols: websocketProtocols(kind, target.apiKey),
		events: [
			buildSessionUpdate({
				backend: kind,
				instructions: "Speak the user's line in one short take. Do not ask a question.",
				voice: target.voice,
				tools: [],
				sampleRate: REALTIME_SAMPLE_RATE,
			}),
			{
				type: "conversation.item.create",
				item: {
					type: "message",
					role: "user",
					content: [{ type: "input_text", text }],
				},
			},
			{ type: "response.create" },
		],
	}
}

type PreviewSocket = {
	readyState: number
	send: (data: string) => void
	close: () => void
	addEventListener: (type: string, fn: (ev: { data?: unknown }) => void) => void
}

type PreviewSocketCtor = new (url: string, protocols?: string | string[]) => PreviewSocket

export function openRealtimePreview(
	plan: VoicePreviewPlan,
	handlers: {
		onDelta: (b64: string) => void
		onDone: () => void
		onError: (message: string) => void
	},
	Socket: PreviewSocketCtor,
): { close: () => void } {
	const ws = plan.protocols?.length ? new Socket(plan.url, plan.protocols) : new Socket(plan.url)
	let phase: "created" | "updated" | "streaming" = "created"
	let closed = false
	const close = () => {
		if (closed) return
		closed = true
		try {
			ws.close()
		} catch {
			/* ignore */
		}
	}
	const fail = (message: string) => {
		if (closed) return
		close()
		handlers.onError(message)
	}
	ws.addEventListener("error", () => fail("Could not preview this voice. Check the URL and key."))
	ws.addEventListener("message", (ev) => {
		if (closed || typeof ev.data !== "string") return
		let event: Record<string, unknown>
		try {
			event = JSON.parse(ev.data) as Record<string, unknown>
		} catch {
			return
		}
		const type = String(event.type ?? "")
		if (type === "error") {
			fail("Could not preview this voice. Check the URL and key.")
			return
		}
		if (phase === "created") {
			ws.send(JSON.stringify(plan.events[0]))
			phase = "updated"
			return
		}
		if (phase === "updated" && type === "session.updated") {
			ws.send(JSON.stringify(plan.events[1]))
			ws.send(JSON.stringify(plan.events[2]))
			phase = "streaming"
			return
		}
		const delta = audioDeltaFromEvent(event)
		if (delta) handlers.onDelta(delta)
		if (type === "response.done") {
			close()
			handlers.onDone()
		}
	})
	return { close }
}
