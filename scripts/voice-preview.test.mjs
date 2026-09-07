import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { pcm16ToBase64 } from "../src/lib/pcm.ts"
import { openRealtimePreview, VOICE_PREVIEW_TEXT, voicePreviewPlan } from "../src/lib/voice-preview.ts"
import { speakReply, speakReplyTarget } from "../src/lib/voice-speak.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

test("typed speech uses the configured Realtime voice, not System TTS", () => {
	const target = speakReplyTarget(
		{
			agentName: "Moya",
			userName: "",
			brief: "",
			showCaptions: true,
			provider: { id: "ondevice", model: "a.gguf", baseUrl: "", apiKey: "" },
			voiceBackend: {
				id: "s2s",
				model: "local",
				baseUrl: "http://127.0.0.1:8765/v1",
				apiKey: "",
				voice: "af_heart",
			},
		},
		{ id: "ondevice", model: "a.gguf", baseUrl: "", apiKey: "" },
	)
	assert.equal(target?.id, "s2s")
	assert.equal(target?.voice, "af_heart")
	assert.equal(target?.baseUrl, "http://127.0.0.1:8765/v1")
	assert.equal(
		speakReplyTarget(
			{
				agentName: "Moya",
				userName: "",
				brief: "",
				showCaptions: true,
				provider: { id: "custom", model: "local", baseUrl: "http://127.0.0.1:1234/v1", apiKey: "" },
				voiceBackend: { id: "custom", model: "", baseUrl: "", apiKey: "", voice: "" },
			},
			{ id: "custom", model: "local", baseUrl: "http://127.0.0.1:1234/v1", apiKey: "" },
		),
		null,
	)
	assert.equal(
		speakReplyTarget(
			{
				agentName: "Moya",
				userName: "",
				brief: "",
				showCaptions: true,
				provider: { id: "custom", model: "local", baseUrl: "http://127.0.0.1:1234/v1", apiKey: "" },
				voiceBackend: {
					id: "custom",
					model: "",
					baseUrl: "http://127.0.0.1:8765/v1",
					apiKey: "",
					voice: "",
				},
			},
			{ id: "custom", model: "local", baseUrl: "http://127.0.0.1:1234/v1", apiKey: "" },
		)?.voice,
		"af_heart",
	)
	const speakSrc = readFileSync(join(root, "src/lib/voice-speak.ts"), "utf8")
	assert.match(speakSrc, /prepareSpokenReply/)
	assert.equal(speakSrc.includes("voice-backend"), false)
})

test("typed speech opens Realtime even when AudioContext.resume never resolves", () => {
	const opened = []
	class MockSocket {
		constructor(url) {
			opened.push(String(url))
		}
		addEventListener() {}
		send() {}
		close() {}
	}
	const previous = globalThis.AudioContext
	globalThis.AudioContext = class {
		state = "suspended"
		resume() {
			return new Promise(() => {})
		}
	}
	try {
		speakReply(
			{
				id: "s2s",
				baseUrl: "http://127.0.0.1:8765/v1",
				apiKey: "",
				model: "local",
				voice: "af_heart",
			},
			"Hello from Moya?",
			{},
			MockSocket,
		)
		assert.ok(
			opened.some((url) => /\/realtime/.test(url)),
			`typed speech did not open Realtime; sockets=${opened.join(",") || "(none)"}`,
		)
	} finally {
		globalThis.AudioContext = previous
	}
})

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
	assert.match(JSON.stringify(plan.events[0]), /verbatim/)
	assert.equal(plan.events[1]?.type, "conversation.item.create")
	assert.equal(plan.events[2]?.type, "response.create")
	assert.match(JSON.stringify(plan.events[1]), /Hello from Moya\?/)
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
