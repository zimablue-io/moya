import {
	applyLiveCaption,
	audioDeltaFromEvent,
	buildTruncateEvent,
	EMPTY_LIVE_CAPTION,
	errorFromEvent,
	isBenignInterruptError,
	itemIdFromEvent,
	type LiveCaption,
	planBargeIn,
	responseIdFromEvent,
	shouldAcceptOutputAudio,
	shouldHonorSpeechStart,
	transcriptFromEvent,
} from "./realtime-protocol.ts"
import type { PresenceState } from "./types.ts"

export type RealtimeLoopState = {
	userCaption: LiveCaption
	assistantCaption: LiveCaption
	lastMicRms: number
	outputPlaying: boolean
	queuedMs: number
	playStartedAt: number | null
	now: number
	responseActive: boolean
	currentResponseId: string | null
	currentItemId: string | null
	cancelledResponseId: string | null
	ignoreUntilNewResponse: boolean
}

export const EMPTY_REALTIME_LOOP: RealtimeLoopState = {
	userCaption: EMPTY_LIVE_CAPTION,
	assistantCaption: EMPTY_LIVE_CAPTION,
	lastMicRms: 0,
	outputPlaying: false,
	queuedMs: 0,
	playStartedAt: null,
	now: 0,
	responseActive: false,
	currentResponseId: null,
	currentItemId: null,
	cancelledResponseId: null,
	ignoreUntilNewResponse: false,
}

export type RealtimeLoopAction =
	| { type: "error"; message: string }
	| { type: "speech_start" }
	| { type: "speech_stop" }
	| { type: "response_start" }
	| { type: "response_done"; text: string }
	| { type: "interim"; role: "user" | "assistant"; text: string }
	| { type: "final"; role: "user" | "assistant"; text: string }
	| { type: "play"; audio: string }
	| { type: "flush" }
	| { type: "send"; event: Record<string, unknown> }

export type VoiceUi = {
	presence: PresenceState
	interim: string
	error: string | null
}

export function reduceVoiceUi(ui: VoiceUi, action: RealtimeLoopAction): VoiceUi {
	if (action.type === "interim") {
		return {
			...ui,
			interim: action.text,
			presence: action.role === "user" ? "listening" : "speaking",
		}
	}
	if (action.type === "final") {
		return {
			...ui,
			interim: action.text,
			presence: action.role === "user" ? "thinking" : "speaking",
		}
	}
	if (action.type === "speech_start") return { ...ui, presence: "listening", error: null }
	if (action.type === "speech_stop") return { ...ui, presence: "thinking" }
	if (action.type === "response_start") return { ...ui, presence: "speaking" }
	if (action.type === "response_done") return { ...ui, presence: "listening" }
	if (action.type === "error") return { ...ui, error: action.message }
	return ui
}

export function applyRealtimeEvent(
	prev: RealtimeLoopState,
	event: Record<string, unknown>,
): { state: RealtimeLoopState; actions: RealtimeLoopAction[] } {
	let state = { ...prev }
	const actions: RealtimeLoopAction[] = []
	const type = String(event.type ?? "")
	const err = errorFromEvent(event)
	if (err) {
		if (!isBenignInterruptError(err)) actions.push({ type: "error", message: err })
		return { state, actions }
	}

	if (type === "input_audio_buffer.speech_started") {
		if (shouldHonorSpeechStart({ playing: state.outputPlaying, micRms: state.lastMicRms })) {
			const interrupted = bargeIn(state)
			state = interrupted.state
			actions.push(...interrupted.actions)
		}
		actions.push({ type: "speech_start" })
	}
	if (type === "input_audio_buffer.speech_stopped") {
		actions.push({ type: "speech_stop" })
	}
	if (type === "response.created") {
		state = {
			...state,
			assistantCaption: EMPTY_LIVE_CAPTION,
			responseActive: true,
			currentResponseId: responseIdFromEvent(event),
			currentItemId: null,
			ignoreUntilNewResponse: false,
		}
		actions.push({ type: "response_start" })
	}
	const itemId = itemIdFromEvent(event)
	if (itemId && state.responseActive) state = { ...state, currentItemId: itemId }

	const audio = audioDeltaFromEvent(event)
	if (audio && acceptOutput(state, event)) actions.push({ type: "play", audio })

	const cue = transcriptFromEvent(event)
	if (cue) {
		if (cue.role === "user") {
			const userCaption = applyLiveCaption(state.userCaption, cue)
			state = { ...state, userCaption }
			const text = userCaption.text.trim()
			if (cue.mode === "final") {
				if (text) actions.push({ type: "final", role: "user", text })
			} else if (text) {
				actions.push({ type: "interim", role: "user", text })
			}
		} else if (acceptOutput(state, event)) {
			const assistantCaption = applyLiveCaption(state.assistantCaption, cue)
			state = { ...state, assistantCaption }
			const text = assistantCaption.text.trim()
			if (cue.mode === "final") {
				if (text) actions.push({ type: "final", role: "assistant", text })
			} else if (text) {
				actions.push({ type: "interim", role: "assistant", text })
			}
		}
	}

	if (type === "response.done" || type === "response.cancelled") {
		state = { ...state, responseActive: false }
		const stale =
			state.ignoreUntilNewResponse ||
			(Boolean(state.cancelledResponseId) && responseIdFromEvent(event) === state.cancelledResponseId)
		if (type === "response.done" && !stale) {
			actions.push({ type: "response_done", text: state.assistantCaption.text.trim() })
		}
	}

	return { state, actions }
}

function acceptOutput(state: RealtimeLoopState, event: Record<string, unknown>): boolean {
	return shouldAcceptOutputAudio({
		ignoreUntilNewResponse: state.ignoreUntilNewResponse,
		currentResponseId: state.currentResponseId,
		cancelledResponseId: state.cancelledResponseId,
		eventResponseId: responseIdFromEvent(event),
	})
}

export function bargeIn(state: RealtimeLoopState): { state: RealtimeLoopState; actions: RealtimeLoopAction[] } {
	const plan = planBargeIn({
		responseActive: state.responseActive,
		playing: state.outputPlaying,
		itemId: state.currentItemId,
		queuedMs: state.queuedMs,
		playStartedAt: state.playStartedAt,
		now: state.now,
	})
	let next = { ...state }
	const actions: RealtimeLoopAction[] = []
	if (plan.ignoreUntilNewResponse) {
		next = {
			...next,
			ignoreUntilNewResponse: true,
			cancelledResponseId: next.currentResponseId,
		}
	}
	if (plan.flushPlayback) {
		next = { ...next, outputPlaying: false, queuedMs: 0, playStartedAt: null }
		actions.push({ type: "flush" })
	}
	if (plan.cancelResponse) next = { ...next, responseActive: false }
	if (plan.truncate) next = { ...next, currentItemId: null }
	if (plan.cancelResponse) actions.push({ type: "send", event: { type: "response.cancel" } })
	if (plan.truncate) {
		actions.push({ type: "send", event: buildTruncateEvent(plan.truncate.itemId, plan.truncate.audioEndMs) })
	}
	return { state: next, actions }
}
