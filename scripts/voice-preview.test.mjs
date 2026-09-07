import assert from "node:assert/strict"
import { test } from "node:test"
import { pcm16ToBase64 } from "../src/lib/pcm.ts"
import { openRealtimePreview, VOICE_PREVIEW_TEXT, voicePreviewPlan } from "../src/lib/voice-preview.ts"

test("voice preview line is a fixed spoken sample", () => {
	assert.equal(typeof VOICE_PREVIEW_TEXT, "string")
	assert.match(VOICE_PREVIEW_TEXT, /Moya/)
	assert.match(VOICE_PREVIEW_TEXT, /\?/)
	assert.ok(VOICE_PREVIEW_TEXT.length > 80)
})

test("Local preview is a Realtime websocket turn, not HTTP /audio/speech", () => {
	const plan = voicePreviewPlan(
		{
			id: "s2s",
			baseUrl: "http://127.0.0.1:8765/v1",
			apiKey: "",
			model: "local",
			voice: "af_heart",
		},
		"Hello from Moya?",
	)
	assert.equal(String(plan.url).includes("/audio/speech"), false)
	assert.equal(String(plan.url).includes("/voices"), false)
	assert.match(plan.url, /^ws:\/\/127\.0\.0\.1:8765\/v1\/realtime/)
	assert.match(plan.url, /model=local/)
	assert.equal(plan.events[0]?.type, "session.update")
	assert.equal(plan.events[1]?.type, "conversation.item.create")
	assert.equal(plan.events[2]?.type, "response.create")
	const item = plan.events[1]?.item
	assert.equal(item && typeof item === "object" && item.role, "user")
})

test("xAI and OpenAI preview use the Realtime socket, not a guessed TTS path", () => {
	const xai = voicePreviewPlan(
		{
			id: "custom",
			baseUrl: "https://api.x.ai/v1",
			apiKey: "sk",
			model: "",
			voice: "eve",
		},
		"Hello from Moya?",
	)
	assert.match(xai.url, /^wss:\/\/api\.x.ai\/v1\/realtime/)
	assert.match(xai.url, /model=grok-voice-latest/)
	assert.equal(xai.protocols?.[0]?.startsWith("xai-client-secret."), true)

	const openai = voicePreviewPlan(
		{
			id: "custom",
			baseUrl: "https://api.openai.com/v1",
			apiKey: "sk",
			model: "",
			voice: "marin",
		},
		"Hello from Moya?",
	)
	assert.match(openai.url, /^wss:\/\/api\.openai.com\/v1\/realtime/)
	assert.match(openai.url, /model=gpt-realtime/)
})

test("preview socket speaks after session.updated and stops on response.done", async () => {
	const pcm = pcm16ToBase64(new Int16Array([0, 1000, -1000, 0]))
	const sent = []
	const deltas = []
	let done = false
	class MockSocket {
		handlers = {}
		constructor() {
			queueMicrotask(() => {
				this.handlers.message?.({ data: JSON.stringify({ type: "session.created", session: {} }) })
			})
		}
		addEventListener(type, fn) {
			this.handlers[type] = fn
		}
		send(data) {
			const event = JSON.parse(String(data))
			sent.push(event.type)
			queueMicrotask(() => {
				if (event.type === "session.update") {
					this.handlers.message?.({ data: JSON.stringify({ type: "session.updated", session: {} }) })
				}
				if (event.type === "response.create") {
					this.handlers.message?.({
						data: JSON.stringify({ type: "response.output_audio.delta", delta: pcm }),
					})
					this.handlers.message?.({ data: JSON.stringify({ type: "response.done" }) })
				}
			})
		}
		close() {}
	}
	const plan = voicePreviewPlan(
		{
			id: "s2s",
			baseUrl: "http://127.0.0.1:8765/v1",
			apiKey: "",
			model: "local",
			voice: "af_heart",
		},
		"Hello from Moya?",
	)
	await new Promise((resolve, reject) => {
		openRealtimePreview(
			plan,
			{
				onDelta: (b64) => deltas.push(b64),
				onDone: () => {
					done = true
					resolve()
				},
				onError: (message) => reject(new Error(message)),
			},
			MockSocket,
		)
	})
	assert.deepEqual(sent, ["session.update", "conversation.item.create", "response.create"])
	assert.deepEqual(deltas, [pcm])
	assert.equal(done, true)
})
