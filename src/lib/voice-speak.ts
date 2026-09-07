import { base64ToPcm16, pcm16ToFloat } from "./pcm.ts"
import { ScheduledAudioQueue } from "./realtime-playback.ts"
import { REALTIME_SAMPLE_RATE, resolveVoiceApiKey } from "./realtime-protocol.ts"
import type { ProviderConfig, Settings } from "./types.ts"
import { conversationVoice } from "./voice-contract.ts"
import { openRealtimePreview, type VoicePreviewTarget, voicePreviewPlan } from "./voice-preview.ts"

let close: (() => void) | null = null
let queue: ScheduledAudioQueue | null = null
let ctx: AudioContext | null = null
let endHook: (() => void) | null = null

function finish() {
	const fn = endHook
	endHook = null
	fn?.()
}

export function stopSpokenReply() {
	close?.()
	close = null
	queue?.flush()
	queue = null
	finish()
}

function audioContextCtor(): typeof AudioContext | undefined {
	return globalThis.AudioContext
}

export function prepareSpokenReply(): void {
	const Audio = audioContextCtor()
	if (!Audio) return
	if (!ctx || ctx.state === "closed") {
		ctx = new Audio({ sampleRate: REALTIME_SAMPLE_RATE })
	}
	void ctx.resume()
}

export function speakReplyTarget(settings: Settings, provider: ProviderConfig): VoicePreviewTarget | null {
	const voice = settings.voiceBackend
	if (!voice.baseUrl.trim()) return null
	const id = conversationVoice(settings)
	if (!id) return null
	return {
		id: voice.id,
		baseUrl: voice.baseUrl,
		apiKey: resolveVoiceApiKey(voice, provider),
		model: voice.model,
		voice: id,
	}
}

export function speakReply(
	target: VoicePreviewTarget,
	text: string,
	hooks?: { onEnd?: () => void; onError?: (message: string) => void },
	Socket: typeof WebSocket = WebSocket,
): void {
	const trimmed = text.trim()
	const Audio = audioContextCtor()
	if (!trimmed || !Audio) {
		hooks?.onEnd?.()
		return
	}
	stopSpokenReply()
	const audio = ctx && ctx.state !== "closed" ? ctx : new Audio({ sampleRate: REALTIME_SAMPLE_RATE })
	ctx = audio
	const q = new ScheduledAudioQueue()
	queue = q
	endHook = () => hooks?.onEnd?.()
	q.onIdle = () => finish()
	const plan = voicePreviewPlan(target, trimmed)
	void audio.resume().catch(() => {})
	try {
		close = openRealtimePreview(
			plan,
			{
				onDelta: (b64) => {
					if (!ctx || queue !== q) return
					const pcm = base64ToPcm16(b64)
					if (!pcm.length) return
					const samples = pcm16ToFloat(pcm)
					const buf = ctx.createBuffer(1, samples.length, REALTIME_SAMPLE_RATE)
					buf.getChannelData(0).set(samples)
					const src = ctx.createBufferSource()
					src.buffer = buf
					src.connect(ctx.destination)
					q.schedule(src, buf.duration, ctx.currentTime)
				},
				onDone: () => {
					close = null
					if (q.liveCount === 0) finish()
				},
				onError: (message) => {
					stopSpokenReply()
					hooks?.onError?.(message)
				},
			},
			Socket,
		).close
	} catch {
		stopSpokenReply()
		hooks?.onError?.("Could not play this voice.")
	}
}
