import assert from "node:assert/strict"
import { test } from "node:test"
import { audioBufferFromPreviewResponse, VOICE_PREVIEW_TEXT, voicePreviewRequest } from "../src/lib/voice-preview.ts"

test("voice preview line is a fixed spoken sample", () => {
	assert.equal(typeof VOICE_PREVIEW_TEXT, "string")
	assert.match(VOICE_PREVIEW_TEXT, /Moya/)
	assert.match(VOICE_PREVIEW_TEXT, /\?/)
	assert.ok(VOICE_PREVIEW_TEXT.length > 80)
})

test("xAI preview posts the documented TTS body to /tts", () => {
	const req = voicePreviewRequest(
		{
			id: "custom",
			baseUrl: "https://api.x.ai/v1",
			apiKey: "sk",
			model: "grok-voice-latest",
			voice: "eve",
		},
		"Hello from Moya?",
	)
	assert.equal(req.url, "https://api.x.ai/v1/tts")
	assert.equal(req.init.method, "POST")
	assert.equal(req.init.headers.Authorization, "Bearer sk")
	assert.deepEqual(JSON.parse(String(req.init.body)), {
		text: "Hello from Moya?",
		voice_id: "eve",
		language: "en",
	})
})

test("OpenAI-compatible preview posts /audio/speech with input and voice", () => {
	const openai = voicePreviewRequest(
		{
			id: "custom",
			baseUrl: "https://api.openai.com/v1",
			apiKey: "sk",
			model: "gpt-realtime",
			voice: "marin",
		},
		"Hello from Moya?",
	)
	assert.equal(openai.url, "https://api.openai.com/v1/audio/speech")
	assert.deepEqual(JSON.parse(String(openai.init.body)), {
		model: "gpt-realtime",
		input: "Hello from Moya?",
		voice: "marin",
	})

	const local = voicePreviewRequest(
		{
			id: "s2s",
			baseUrl: "http://127.0.0.1:8765/v1",
			apiKey: "",
			model: "local",
			voice: "af_heart",
		},
		"Hello from Moya?",
	)
	assert.equal(local.url, "http://127.0.0.1:8765/v1/audio/speech")
	assert.equal(local.init.headers.Authorization, undefined)
	assert.deepEqual(JSON.parse(String(local.init.body)), {
		model: "local",
		input: "Hello from Moya?",
		voice: "af_heart",
	})
})

test("preview audio is raw bytes or xAI JSON base64", async () => {
	const raw = new Uint8Array([1, 2, 3]).buffer
	const fromBinary = await audioBufferFromPreviewResponse({
		ok: true,
		headers: { get: () => "audio/mpeg" },
		arrayBuffer: async () => raw,
	})
	assert.equal(fromBinary.byteLength, 3)

	const fromJson = await audioBufferFromPreviewResponse({
		ok: true,
		headers: { get: () => "application/json" },
		arrayBuffer: async () => new ArrayBuffer(0),
		json: async () => ({ audio: Buffer.from("abc").toString("base64"), content_type: "audio/mpeg" }),
	})
	assert.deepEqual([...new Uint8Array(fromJson)], [...Buffer.from("abc")])
})
