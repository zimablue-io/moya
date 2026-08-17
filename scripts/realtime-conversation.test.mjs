import assert from "node:assert/strict"
import { test } from "node:test"
import { applyRealtimeEvent, EMPTY_REALTIME_LOOP, reduceVoiceUi } from "../src/lib/realtime-loop.ts"
import { displayVoiceCaption, realtimeSocketUrl } from "../src/lib/realtime-protocol.ts"
import {
	SIDECAR_ASSISTANT,
	SIDECAR_USER,
	sidecarConversationEvents,
	startMockRealtimeSidecar,
} from "./mock-realtime-sidecar.mjs"

function drive(events, initial = {}) {
	let state = { ...EMPTY_REALTIME_LOOP, ...initial }
	let ui = { presence: "listening", interim: "", error: null }
	const shown = []
	const sent = []
	const actions = []
	for (const event of events) {
		const next = applyRealtimeEvent(state, event)
		state = next.state
		for (const action of next.actions) {
			actions.push(action)
			if (action.type === "send") sent.push(action.event)
			ui = reduceVoiceUi(ui, action)
			shown.push(displayVoiceCaption({ showCaptions: true, liveLine: ui.interim }))
		}
	}
	return { state, ui, shown, sent, actions }
}

test("local sidecar captions grow through VAD and keep the user line while thinking", () => {
	const { ui, shown, actions } = drive(sidecarConversationEvents())
	assert.equal(ui.interim, SIDECAR_ASSISTANT)
	assert.equal(ui.presence, "listening")
	assert.ok(shown.includes("Okay"))
	assert.ok(shown.includes("Okay, this is"))
	assert.ok(shown.includes(SIDECAR_USER))
	assert.ok(shown.includes("Got it."))
	assert.ok(shown.includes(SIDECAR_ASSISTANT))

	const firstText = shown.findIndex((line) => line.length > 0)
	assert.ok(firstText >= 0)
	assert.ok(
		shown.slice(firstText).every((line) => line.length > 0),
		`caption flashed empty after speech started: ${JSON.stringify(shown)}`,
	)
	assert.equal(shown.includes("On it."), false, "empty live line must not resurrect a previous assistant sentence")

	const userFinal = actions.findIndex((action) => action.type === "final" && action.role === "user")
	const speechStop = actions.findIndex((action) => action.type === "speech_stop")
	const responseStart = actions.findIndex((action) => action.type === "response_start")
	assert.ok(speechStop >= 0)
	assert.ok(userFinal > speechStop)
	assert.equal(shown[speechStop], "Okay, this is")
	assert.equal(shown[userFinal], SIDECAR_USER)
	assert.equal(shown[responseStart], SIDECAR_USER)
	assert.ok(actions.some((action) => action.type === "response_done" && action.text === SIDECAR_ASSISTANT))
})

test("Grok cumulative updates replace and still survive speech_stopped", () => {
	const { shown, ui } = drive([
		{ type: "input_audio_buffer.speech_started" },
		{
			type: "conversation.item.input_audio_transcription.updated",
			item_id: "item_g1",
			transcript: "hello",
		},
		{ type: "input_audio_buffer.speech_stopped" },
		{
			type: "conversation.item.input_audio_transcription.updated",
			item_id: "item_g1",
			transcript: "hello there",
		},
		{
			type: "conversation.item.input_audio_transcription.completed",
			item_id: "item_g1",
			transcript: "hello there",
		},
	])
	assert.deepEqual(shown.filter(Boolean), ["hello", "hello", "hello there", "hello there"])
	assert.equal(ui.presence, "thinking")
	assert.equal(ui.interim, "hello there")
})

test("OpenAI incremental deltas append on the same item", () => {
	const { ui } = drive([
		{
			type: "conversation.item.input_audio_transcription.delta",
			item_id: "item_o1",
			delta: "Hel",
		},
		{
			type: "conversation.item.input_audio_transcription.delta",
			item_id: "item_o1",
			delta: "lo",
		},
		{
			type: "conversation.item.input_audio_transcription.completed",
			item_id: "item_o1",
			transcript: "Hello",
		},
	])
	assert.equal(ui.interim, "Hello")
})

test("speaker echo while playing does not cancel the reply", () => {
	const { sent, actions } = drive([{ type: "input_audio_buffer.speech_started" }], {
		outputPlaying: true,
		lastMicRms: 0.01,
		responseActive: true,
		currentResponseId: "resp_1",
		currentItemId: "item_a1",
		queuedMs: 1200,
		playStartedAt: 1,
		now: 1.4,
	})
	assert.deepEqual(sent, [])
	assert.equal(
		actions.some((action) => action.type === "flush"),
		false,
	)
	assert.ok(actions.some((action) => action.type === "speech_start"))
})

test("a real barge-in while playing cancels and flushes", () => {
	const { sent, actions } = drive([{ type: "input_audio_buffer.speech_started" }], {
		outputPlaying: true,
		lastMicRms: 0.2,
		responseActive: true,
		currentResponseId: "resp_1",
		currentItemId: "item_a1",
		queuedMs: 1200,
		playStartedAt: 1,
		now: 1.4,
	})
	assert.ok(actions.some((action) => action.type === "flush"))
	assert.ok(sent.some((event) => event.type === "response.cancel"))
	assert.ok(sent.some((event) => event.type === "conversation.item.truncate"))
})

test("displayVoiceCaption never falls back to a stale assistant caption", () => {
	assert.equal(displayVoiceCaption({ showCaptions: true, liveLine: "" }), "")
	assert.equal(displayVoiceCaption({ showCaptions: true, liveLine: "   " }), "")
	const stale = "On it."
	const live = ""
	assert.notEqual(live || stale, displayVoiceCaption({ showCaptions: true, liveLine: live }))
})

test("mock sidecar WebSocket plays a full local turn the client can caption", async () => {
	const sidecar = await startMockRealtimeSidecar(0)
	const events = []
	try {
		const ws = new WebSocket(realtimeSocketUrl(sidecar.url, "local"))
		await new Promise((resolve, reject) => {
			ws.addEventListener("open", resolve)
			ws.addEventListener("error", () => reject(new Error("mock sidecar socket failed")))
		})
		ws.addEventListener("message", (ev) => {
			if (typeof ev.data === "string") events.push(JSON.parse(ev.data))
		})
		ws.send(JSON.stringify({ type: "session.update", session: { type: "realtime" } }))
		const deadline = Date.now() + 4000
		while (!events.some((event) => event.type === "response.done") && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 40))
		}
		ws.close()
	} finally {
		await sidecar.close()
	}

	assert.ok(events.some((event) => event.type === "conversation.item.input_audio_transcription.completed"))
	assert.ok(events.some((event) => event.type === "response.done"))
	const { ui, shown, actions } = drive(events)
	assert.equal(ui.interim, SIDECAR_ASSISTANT)
	assert.ok(shown.slice(shown.findIndex((line) => line.length > 0)).every((line) => line.length > 0))
	assert.ok(actions.some((action) => action.type === "response_done" && action.text === SIDECAR_ASSISTANT))
})
