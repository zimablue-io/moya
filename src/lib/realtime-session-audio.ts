import { captureDenied } from "./media-permission"
import { base64ToPcm16, capturePcm16Base64, pcm16ToFloat, rmsLevel } from "./pcm"
import type { ScheduledAudioQueue } from "./realtime-playback"
import { realtimeHttpBase, shouldSendInputAudio } from "./realtime-protocol"
import type { VoiceBackendId } from "./types"
import { clamp } from "./utils"

export type RealtimeMicOpts = {
	gen: number
	getGen: () => number
	getWs: () => WebSocket | null
	output: ScheduledAudioQueue
	sampleRate: number
	isLive: () => boolean
	onError?: (message: string) => void
	onLevel?: (level: number, bands: number[]) => void
}

export function padBands(bands: number[]): number[] {
	const out = bands.slice(0, 24)
	while (out.length < 24) out.push(out[out.length - 1] ?? 0.18)
	return out
}

export async function mintClientSecret(id: VoiceBackendId, baseUrl: string, apiKey: string): Promise<string | null> {
	const http = realtimeHttpBase(baseUrl)
	try {
		const res = await fetch(`${http}/realtime/client_secrets`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(
				id === "openai"
					? { expires_after: { seconds: 300 }, session: { type: "realtime" } }
					: { expires_after: { seconds: 300 } },
			),
			signal: AbortSignal.timeout(8000),
		})
		if (!res.ok) return null
		const json = (await res.json()) as Record<string, unknown>
		if (typeof json.value === "string") return json.value
		if (typeof json.client_secret === "string") return json.client_secret
		const nested = json.client_secret
		if (nested && typeof nested === "object") {
			const value = (nested as { value?: unknown }).value
			if (typeof value === "string") return value
		}
		if (typeof json.token === "string") return json.token
	} catch {
		/* CORS or offline — fall back to the stored key in the protocol. */
	}
	return null
}

export class RealtimeAudio {
	ctx: AudioContext | null = null
	analyser: AnalyserNode | null = null
	micStream: MediaStream | null = null
	processor: ScriptProcessorNode | null = null
	raf = 0
	lastMicRms = 0

	get currentTime() {
		return this.ctx?.currentTime ?? 0
	}

	async attach(opts: RealtimeMicOpts): Promise<void> {
		if (!navigator.mediaDevices?.getUserMedia) {
			opts.onError?.("No microphone found. Type instead.")
			return
		}
		try {
			this.micStream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
					channelCount: 1,
				},
			})
			if (opts.getGen() !== opts.gen) {
				this.micStream.getTracks().forEach((t) => t.stop())
				this.micStream = null
				return
			}
			const Ctx =
				window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
			this.ctx = new Ctx()
			if (this.ctx.state === "suspended") await this.ctx.resume()
			const src = this.ctx.createMediaStreamSource(this.micStream)
			this.analyser = this.ctx.createAnalyser()
			this.analyser.fftSize = 64
			src.connect(this.analyser)
			const processor = this.ctx.createScriptProcessor(4096, 1, 1)
			const mute = this.ctx.createGain()
			mute.gain.value = 0
			src.connect(processor)
			processor.connect(mute)
			mute.connect(this.ctx.destination)
			processor.onaudioprocess = (ev) => {
				if (opts.getGen() !== opts.gen) return
				const ws = opts.getWs()
				if (!ws || ws.readyState !== WebSocket.OPEN) return
				const input = ev.inputBuffer.getChannelData(0)
				const micRms = rmsLevel(input)
				this.lastMicRms = micRms
				if (!shouldSendInputAudio({ playing: opts.output.playing || opts.output.liveCount > 0, micRms })) {
					return
				}
				const audio = capturePcm16Base64(input, this.ctx?.sampleRate ?? 48_000, opts.sampleRate)
				if (!audio) return
				ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio }))
			}
			this.processor = processor
			this.loopLevels(opts)
		} catch {
			const fail = captureDenied()
			opts.onError?.(fail.message)
		}
	}

	detach() {
		if (this.raf) cancelAnimationFrame(this.raf)
		this.raf = 0
		try {
			this.processor?.disconnect()
		} catch {
			/* ignore */
		}
		this.processor = null
		this.micStream?.getTracks().forEach((t) => t.stop())
		this.micStream = null
		void this.ctx?.close()
		this.ctx = null
		this.analyser = null
	}

	loopLevels(opts: Pick<RealtimeMicOpts, "isLive" | "output" | "onLevel">) {
		if (this.raf) cancelAnimationFrame(this.raf)
		const tick = () => {
			if (!opts.isLive() && !opts.output.playing) return
			if (this.analyser && !opts.output.playing) {
				const buf = new Uint8Array(this.analyser.frequencyBinCount)
				this.analyser.getByteFrequencyData(buf)
				const bands = Array.from(buf).map((n) => n / 255)
				const level = bands.reduce((a, b) => a + b, 0) / Math.max(1, bands.length)
				opts.onLevel?.(clamp(level * 1.8, 0, 1), padBands(bands))
			}
			this.raf = requestAnimationFrame(tick)
		}
		this.raf = requestAnimationFrame(tick)
	}

	playDelta(
		b64: string,
		output: ScheduledAudioQueue,
		sampleRate: number,
		onLevel?: (level: number, bands: number[]) => void,
	) {
		const ctx = this.ctx
		if (!ctx) return
		const pcm = base64ToPcm16(b64)
		if (pcm.length === 0) return
		const samples = pcm16ToFloat(pcm)
		const buf = ctx.createBuffer(1, samples.length, sampleRate)
		buf.getChannelData(0).set(samples)
		const src = ctx.createBufferSource()
		src.buffer = buf
		if (this.analyser) src.connect(this.analyser)
		src.connect(ctx.destination)
		output.schedule(src, buf.duration, ctx.currentTime)
		const level = clamp(rmsLevel(samples) * 4, 0, 1)
		onLevel?.(level, padBands(Array.from({ length: 24 }, () => level)))
	}
}
