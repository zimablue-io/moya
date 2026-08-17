import { ensureMicrophoneAccess } from "./media-permission"
import { applyRealtimeEvent, bargeIn, type RealtimeLoopAction, type RealtimeLoopState } from "./realtime-loop"
import { ScheduledAudioQueue } from "./realtime-playback"
import { mintClientSecret, RealtimeAudio } from "./realtime-session-audio"
import type { VoiceBackendId } from "./types"
import {
	buildSessionUpdate,
	EMPTY_LIVE_CAPTION,
	type FunctionCallCue,
	functionCallFromEvent,
	REALTIME_SAMPLE_RATE,
	type RealtimeTool,
	realtimeSocketUrl,
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
	private audio = new RealtimeAudio()
	private handlers: RealtimeHandlers = {}
	private userCaption = EMPTY_LIVE_CAPTION
	private assistantCaption = EMPTY_LIVE_CAPTION
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
			void this.audio.attach(this.micOpts(gen))
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
			this.audio.detach()
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
		this.audio.lastMicRms = 0
		this.resetPlaybackState()
		try {
			this.ws?.close()
		} catch {
			/* ignore */
		}
		this.ws = null
		this.audio.detach()
	}

	private micOpts(gen: number) {
		return {
			gen,
			getGen: () => this.gen,
			getWs: () => this.ws,
			output: this.output,
			sampleRate: this.sampleRate,
			isLive: () => this.active,
			onError: (message: string) => this.handlers.onError?.(message),
			onLevel: (level: number, bands: number[]) => this.handlers.onLevel?.(level, bands),
		}
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
			lastMicRms: this.audio.lastMicRms,
			outputPlaying: this.output.playing || this.output.liveCount > 0,
			queuedMs: this.output.queuedMs,
			playStartedAt: this.output.playStartedAt,
			now: this.audio.currentTime,
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
			else if (action.type === "play")
				this.audio.playDelta(action.audio, this.output, this.sampleRate, this.handlers.onLevel)
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
}

export const realtimeSession = new RealtimeSession()
