import { captureDenied, ensureMicrophoneAccess } from "./media-permission"
import { base64ToPcm16, capturePcm16Base64, pcm16ToFloat, rmsLevel } from "./pcm"
import { applyRealtimeEvent, bargeIn, type RealtimeLoopAction, type RealtimeLoopState } from "./realtime-loop"
import { ScheduledAudioQueue } from "./realtime-playback"
import type { VoiceBackendId } from "./types"
import { clamp } from "./utils"
import {
	buildSessionUpdate,
	EMPTY_LIVE_CAPTION,
	type FunctionCallCue,
	functionCallFromEvent,
	REALTIME_SAMPLE_RATE,
	type RealtimeTool,
	realtimeHttpBase,
	realtimeSocketUrl,
	shouldSendInputAudio,
	voiceBackendNeedsKey,
	websocketProtocols,
} from "./voice-backend"
import { connectFailureMessage } from "./voice-contract"

export type RealtimeHandlers = {
	onLevel?: (level: number, bands: number[]) => void
	onInterim?: (role: "user" | "assistant", text: string) => void
	onFinal?: (role: "user" | "assistant", text: string) => void
	onSpeechStart?: () => void
	onSpeechStop?: () => void
	onResponseStart?: () => void
	onResponseDone?: (assistantText: string) => void
	onFunctionCall?: (call: FunctionCallCue) => Promise<string>
	onError?: (message: string) => void
	onClose?: () => void
}

type ConnectOpts = {
	id: VoiceBackendId
	baseUrl: string
	model: string
	apiKey: string
	voice: string
	instructions: string
	tools: RealtimeTool[]
}

export class RealtimeSession {
	private ws: WebSocket | null = null
	private gen = 0
	private audioCtx: AudioContext | null = null
	private analyser: AnalyserNode | null = null
	private micStream: MediaStream | null = null
	private processor: ScriptProcessorNode | null = null
	private raf = 0
	private handlers: RealtimeHandlers = {}
	private userCaption = EMPTY_LIVE_CAPTION
	private assistantCaption = EMPTY_LIVE_CAPTION
	private lastMicRms = 0
	private sampleRate = REALTIME_SAMPLE_RATE
	private seenCalls = new Set<string>()
	private output = new ScheduledAudioQueue()
	private responseActive = false
	private currentResponseId: string | null = null
	private currentItemId: string | null = null
	private cancelledResponseId: string | null = null
	private ignoreUntilNewResponse = false

	configure(handlers: RealtimeHandlers) {
		this.handlers = handlers
	}

	get active() {
		return this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING
	}

	async start(opts: ConnectOpts) {
		this.stop()
		const gen = ++this.gen
		const access = await ensureMicrophoneAccess()
		if (this.gen !== gen) return
		if (!access.ok) {
			this.handlers.onError?.(access.message)
			return
		}
		let url: string
		try {
			url = realtimeSocketUrl(opts.baseUrl, opts.model)
		} catch (err) {
			this.handlers.onError?.(err instanceof Error ? err.message : "No voice endpoint configured.")
			return
		}

		let secret = opts.apiKey
		if (voiceBackendNeedsKey(opts.id)) {
			if (!opts.apiKey) {
				this.handlers.onError?.(`Add an API key for ${opts.id === "xai" ? "xAI" : "OpenAI"} in Settings.`)
				return
			}
			secret = (await mintClientSecret(opts.id, opts.baseUrl, opts.apiKey)) ?? opts.apiKey
			if (this.gen !== gen) return
		}

		const protocols = websocketProtocols(opts.id, voiceBackendNeedsKey(opts.id) ? secret : "")
		const ws = protocols?.length ? new WebSocket(url, protocols) : new WebSocket(url)
		this.ws = ws

		ws.onopen = () => {
			if (this.gen !== gen || this.ws !== ws) return
			ws.send(
				JSON.stringify(
					buildSessionUpdate({
						backend: opts.id,
						instructions: opts.instructions,
						voice: opts.voice,
						tools: opts.tools,
						sampleRate: this.sampleRate,
					}),
				),
			)
			void this.attachMic(gen)
		}

		ws.onmessage = (ev) => {
			if (this.gen !== gen || this.ws !== ws) return
			if (typeof ev.data !== "string") return
			let event: Record<string, unknown>
			try {
				event = JSON.parse(ev.data) as Record<string, unknown>
			} catch {
				return
			}
			void this.onEvent(event)
		}

		ws.onerror = () => {
			if (this.gen !== gen || this.ws !== ws) return
			this.handlers.onError?.(connectFailureMessage(opts.baseUrl))
		}

		ws.onclose = () => {
			if (this.gen !== gen) return
			if (this.ws === ws) this.ws = null
			this.detachMic()
			this.handlers.onClose?.()
		}
	}

	sendFunctionOutput(callId: string, output: string) {
		const ws = this.ws
		if (!ws || ws.readyState !== WebSocket.OPEN) return
		ws.send(
			JSON.stringify({
				type: "conversation.item.create",
				item: { type: "function_call_output", call_id: callId, output },
			}),
		)
		ws.send(JSON.stringify({ type: "response.create" }))
	}

	cancelResponse() {
		const { state, actions } = bargeIn(this.loopSnapshot())
		this.applyLoop(state)
		this.dispatchActions(actions)
	}

	stop() {
		this.gen += 1
		this.seenCalls.clear()
		this.userCaption = EMPTY_LIVE_CAPTION
		this.assistantCaption = EMPTY_LIVE_CAPTION
		this.lastMicRms = 0
		this.resetPlaybackState()
		try {
			this.ws?.close()
		} catch {
			/* ignore */
		}
		this.ws = null
		this.detachMic()
	}

	private async onEvent(event: Record<string, unknown>) {
		const { state, actions } = applyRealtimeEvent(this.loopSnapshot(), event)
		this.applyLoop(state)
		this.dispatchActions(actions)
		const call = functionCallFromEvent(event)
		if (call && !this.seenCalls.has(call.callId)) {
			this.seenCalls.add(call.callId)
			const output = (await this.handlers.onFunctionCall?.(call)) ?? ""
			this.sendFunctionOutput(call.callId, output)
		}
	}

	private loopSnapshot(): RealtimeLoopState {
		return {
			userCaption: this.userCaption,
			assistantCaption: this.assistantCaption,
			lastMicRms: this.lastMicRms,
			outputPlaying: this.output.playing || this.output.liveCount > 0,
			queuedMs: this.output.queuedMs,
			playStartedAt: this.output.playStartedAt,
			now: this.audioCtx?.currentTime ?? 0,
			responseActive: this.responseActive,
			currentResponseId: this.currentResponseId,
			currentItemId: this.currentItemId,
			cancelledResponseId: this.cancelledResponseId,
			ignoreUntilNewResponse: this.ignoreUntilNewResponse,
		}
	}

	private applyLoop(state: RealtimeLoopState) {
		this.userCaption = state.userCaption
		this.assistantCaption = state.assistantCaption
		this.responseActive = state.responseActive
		this.currentResponseId = state.currentResponseId
		this.currentItemId = state.currentItemId
		this.cancelledResponseId = state.cancelledResponseId
		this.ignoreUntilNewResponse = state.ignoreUntilNewResponse
	}

	private dispatchActions(actions: RealtimeLoopAction[]) {
		for (const action of actions) {
			if (action.type === "error") this.handlers.onError?.(action.message)
			else if (action.type === "speech_start") this.handlers.onSpeechStart?.()
			else if (action.type === "speech_stop") this.handlers.onSpeechStop?.()
			else if (action.type === "response_start") this.handlers.onResponseStart?.()
			else if (action.type === "response_done") this.handlers.onResponseDone?.(action.text)
			else if (action.type === "interim") this.handlers.onInterim?.(action.role, action.text)
			else if (action.type === "final") this.handlers.onFinal?.(action.role, action.text)
			else if (action.type === "play") this.playDelta(action.audio)
			else if (action.type === "flush") this.output.flush()
			else if (action.type === "send") {
				const ws = this.ws
				if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(action.event))
			}
		}
	}

	private resetPlaybackState() {
		this.output.flush()
		this.responseActive = false
		this.currentResponseId = null
		this.currentItemId = null
		this.cancelledResponseId = null
		this.ignoreUntilNewResponse = false
	}

	private playDelta(b64: string) {
		const ctx = this.audioCtx
		if (!ctx) return
		const pcm = base64ToPcm16(b64)
		if (pcm.length === 0) return
		const samples = pcm16ToFloat(pcm)
		const buf = ctx.createBuffer(1, samples.length, this.sampleRate)
		buf.getChannelData(0).set(samples)
		const src = ctx.createBufferSource()
		src.buffer = buf
		if (this.analyser) src.connect(this.analyser)
		src.connect(ctx.destination)
		this.output.schedule(src, buf.duration, ctx.currentTime)
		const level = clamp(rmsLevel(samples) * 4, 0, 1)
		this.handlers.onLevel?.(level, padBands(Array.from({ length: 24 }, () => level)))
	}

	private async attachMic(gen: number) {
		if (!navigator.mediaDevices?.getUserMedia) {
			this.handlers.onError?.("No microphone found. Type instead.")
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
			if (this.gen !== gen) {
				this.micStream.getTracks().forEach((t) => t.stop())
				this.micStream = null
				return
			}
			const Ctx =
				window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
			this.audioCtx = new Ctx()
			if (this.audioCtx.state === "suspended") await this.audioCtx.resume()
			const src = this.audioCtx.createMediaStreamSource(this.micStream)
			this.analyser = this.audioCtx.createAnalyser()
			this.analyser.fftSize = 64
			src.connect(this.analyser)
			const processor = this.audioCtx.createScriptProcessor(4096, 1, 1)
			const mute = this.audioCtx.createGain()
			mute.gain.value = 0
			src.connect(processor)
			processor.connect(mute)
			mute.connect(this.audioCtx.destination)
			processor.onaudioprocess = (ev) => {
				if (this.gen !== gen) return
				const ws = this.ws
				if (!ws || ws.readyState !== WebSocket.OPEN) return
				const input = ev.inputBuffer.getChannelData(0)
				const micRms = rmsLevel(input)
				this.lastMicRms = micRms
				if (
					!shouldSendInputAudio({
						playing: this.output.playing || this.output.liveCount > 0,
						micRms,
					})
				) {
					return
				}
				const audio = capturePcm16Base64(input, this.audioCtx?.sampleRate ?? 48_000, this.sampleRate)
				if (!audio) return
				ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio }))
			}
			this.processor = processor
			this.loopLevels()
		} catch {
			const fail = captureDenied()
			this.handlers.onError?.(fail.message)
		}
	}

	private detachMic() {
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
		void this.audioCtx?.close()
		this.audioCtx = null
		this.analyser = null
	}

	private loopLevels() {
		if (this.raf) cancelAnimationFrame(this.raf)
		const tick = () => {
			if (!this.active && !this.output.playing) return
			if (this.analyser && !this.output.playing) {
				const buf = new Uint8Array(this.analyser.frequencyBinCount)
				this.analyser.getByteFrequencyData(buf)
				const bands = Array.from(buf).map((n) => n / 255)
				const level = bands.reduce((a, b) => a + b, 0) / Math.max(1, bands.length)
				this.handlers.onLevel?.(clamp(level * 1.8, 0, 1), padBands(bands))
			}
			this.raf = requestAnimationFrame(tick)
		}
		this.raf = requestAnimationFrame(tick)
	}
}

function padBands(bands: number[]): number[] {
	const out = bands.slice(0, 24)
	while (out.length < 24) out.push(out[out.length - 1] ?? 0.18)
	return out
}

async function mintClientSecret(id: VoiceBackendId, baseUrl: string, apiKey: string): Promise<string | null> {
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

export const realtimeSession = new RealtimeSession()
