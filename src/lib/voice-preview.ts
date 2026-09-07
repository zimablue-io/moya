import { realtimeHttpBase } from "./realtime-protocol.ts"
import { type VoiceBackendId, voiceRealtimeKind } from "./types.ts"

export { VOICE_PREVIEW_TEXT } from "./brand.ts"

export type VoicePreviewTarget = {
	id: VoiceBackendId
	baseUrl: string
	apiKey: string
	model: string
	voice: string
}

export function voicePreviewRequest(target: VoicePreviewTarget, text: string): { url: string; init: RequestInit } {
	const base = realtimeHttpBase(target.baseUrl)
	const kind = voiceRealtimeKind(target.id, target.baseUrl)
	const headers: Record<string, string> = { "Content-Type": "application/json" }
	if (target.apiKey.trim()) headers.Authorization = `Bearer ${target.apiKey.trim()}`
	if (kind === "xai") {
		return {
			url: `${base}/tts`,
			init: {
				method: "POST",
				headers,
				body: JSON.stringify({ text, voice_id: target.voice, language: "en" }),
			},
		}
	}
	return {
		url: `${base}/audio/speech`,
		init: {
			method: "POST",
			headers,
			body: JSON.stringify({ model: target.model, input: text, voice: target.voice }),
		},
	}
}

export type VoicePreviewResponse = {
	ok: boolean
	headers: { get: (name: string) => string | null }
	arrayBuffer: () => Promise<ArrayBuffer>
	json?: () => Promise<unknown>
}

export async function audioBufferFromPreviewResponse(res: VoicePreviewResponse): Promise<ArrayBuffer> {
	if (!res.ok) throw new Error("Could not preview this voice.")
	const type = res.headers.get("content-type") ?? ""
	if (type.includes("json") && res.json) {
		const json = await res.json()
		const rec = json && typeof json === "object" ? (json as Record<string, unknown>) : {}
		const b64 = typeof rec.audio === "string" ? rec.audio : ""
		if (!b64) throw new Error("Could not preview this voice.")
		return decodeBase64(b64)
	}
	return res.arrayBuffer()
}

function decodeBase64(b64: string): ArrayBuffer {
	const bin = atob(b64)
	const out = new Uint8Array(bin.length)
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
	return out.buffer
}
