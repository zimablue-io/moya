import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { applyRealtimeEvent, EMPTY_REALTIME_LOOP } from "../src/lib/realtime-loop.ts"
import { buildSessionUpdate, displayVoiceCaption } from "../src/lib/realtime-protocol.ts"
import {
	DEFAULT_SETTINGS,
	KOKORO_TTS_VOICES,
	normalizeSettings,
	POCKET_TTS_VOICES,
	speakersFor,
	VOICE_CHOICES,
	VOICE_PRESETS,
} from "../src/lib/types.ts"
import { listRealtimeSpeakers, POCKET_VOICE_TREE_URL } from "../src/lib/voice-catalog.ts"
import {
	browserSpeechFinalSink,
	connectFailureMessage,
	conversationSpeakerOptions,
	conversationVoice,
	realtimeConnectFromSettings,
	sessionOutputVoice,
	sessionUpdateFromSettings,
	shouldExitVoiceForComposer,
	shouldSpeakTypedReply,
	shouldStartHoldListen,
	typedReplyVoice,
	VOICE_SETTINGS_COPY,
	voiceUiAfterConnectError,
	voiceUiAfterUnexpectedClose,
} from "../src/lib/voice-contract.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function settings(partial = {}) {
	return normalizeSettings({ ...DEFAULT_SETTINGS, ...partial })
}

test("Voice mode sends Conversation speaker, never the system voiceURI", () => {
	const mac = "com.apple.voice.compact.en-US.Samantha"
	const stored = settings({
		voiceURI: mac,
		voiceBackend: { ...DEFAULT_SETTINGS.voiceBackend, voice: "af_bella" },
	})
	assert.equal(conversationVoice(stored), "af_bella")
	assert.equal(typedReplyVoice(stored), mac)
	assert.equal(realtimeConnectFromSettings(stored).voice, "af_bella")

	const event = sessionUpdateFromSettings(stored)
	assert.equal(sessionOutputVoice(event), "af_bella")
	assert.equal(JSON.stringify(event).includes(mac), false)
	assert.equal(JSON.stringify(event).includes("voiceURI"), false)
})

test("changing the system speaker does not change what Voice sends to the sidecar", () => {
	const before = settings({
		voiceURI: "",
		voiceBackend: { ...DEFAULT_SETTINGS.voiceBackend, voice: "af_heart" },
	})
	const after = { ...before, voiceURI: "com.apple.eloquence.en-US.Eddy" }
	assert.equal(sessionOutputVoice(sessionUpdateFromSettings(before)), "af_heart")
	assert.equal(sessionOutputVoice(sessionUpdateFromSettings(after)), "af_heart")
	assert.equal(conversationVoice(after), conversationVoice(before))
})

test("empty Local voice still sends Kokoro Heart so the sidecar cannot stay on bm_fable", () => {
	const empty = settings({
		voiceBackend: { ...DEFAULT_SETTINGS.voiceBackend, voice: "" },
	})
	assert.equal(empty.voiceBackend.voice, "af_heart")
	assert.equal(conversationVoice({ voiceBackend: { ...empty.voiceBackend, voice: "" } }), "af_heart")
	assert.equal(
		sessionOutputVoice(buildSessionUpdate({ backend: "s2s", instructions: "", voice: "", tools: [] })),
		"af_heart",
	)
	assert.equal(sessionOutputVoice(sessionUpdateFromSettings(empty)), "af_heart")
})

test("Local never sends a Pocket name; unknown ids fall back to Heart", () => {
	const pocket = settings({
		voiceBackend: { ...DEFAULT_SETTINGS.voiceBackend, voice: "jean" },
	})
	assert.equal(pocket.voiceBackend.voice, "af_heart")
	assert.equal(conversationVoice(pocket), "af_heart")
	assert.equal(sessionOutputVoice(sessionUpdateFromSettings(pocket)), "af_heart")
	assert.ok(POCKET_TTS_VOICES.some((v) => v.id === "jean"))
	assert.ok(KOKORO_TTS_VOICES.some((v) => v.id === "af_heart"))
	assert.equal(
		sessionOutputVoice(
			sessionUpdateFromSettings(settings({ voiceBackend: { ...DEFAULT_SETTINGS.voiceBackend, voice: "af_bella" } })),
		),
		"af_bella",
	)
})

test("Local catalog is Kokoro only — Pocket names are not pickable", () => {
	const ids = conversationSpeakerOptions("s2s").map((v) => v.id)
	assert.ok(ids.includes("af_heart"))
	assert.ok(ids.includes("af_bella"))
	assert.ok(ids.includes("bm_fable"))
	assert.equal(ids.includes("jean"), false)
	assert.equal(ids.includes("alba"), false)
	assert.deepEqual(
		ids,
		KOKORO_TTS_VOICES.map((v) => v.id),
	)
	assert.equal(VOICE_PRESETS.s2s.voice, "af_heart")
	assert.equal(DEFAULT_SETTINGS.voiceBackend.voice, "af_heart")
	assert.match(VOICE_SETTINGS_COPY.conversationTipLocal, /Kokoro/)
	assert.equal(/Pocket/i.test(VOICE_SETTINGS_COPY.conversationTipLocal), false)
})

test("switching provider to Local resets Conversation speaker to Heart", () => {
	assert.equal(VOICE_PRESETS.s2s.voice, "af_heart")
	assert.equal(VOICE_PRESETS.xai.voice, "eve")
	assert.equal(VOICE_PRESETS.openai.voice, "alloy")
})

test("silent sidecar /v1/voices must not wipe Kokoro or fetch the Pocket Hugging Face tree", async () => {
	const urls = []
	const listed = await listRealtimeSpeakers(
		{ id: "s2s", baseUrl: "http://127.0.0.1:8765/v1", apiKey: "" },
		{
			fallback: speakersFor("s2s"),
			fetch: async (url) => {
				urls.push(String(url))
				return { ok: false, json: async () => ({}) }
			},
		},
	)
	assert.ok(listed.some((v) => v.id === "af_heart"))
	assert.equal(
		listed.some((v) => v.id === "jean"),
		false,
	)
	assert.ok(urls.every((url) => !/huggingface|pocket-tts/i.test(url)))
	assert.equal(
		urls.some((url) => url === POCKET_VOICE_TREE_URL),
		false,
	)
})

test("Voice tab offers Local, Grok, OpenAI, and System — same one-provider pattern as Model", () => {
	assert.deepEqual(VOICE_CHOICES, ["s2s", "xai", "openai", "browser"])
	assert.equal(VOICE_PRESETS.browser.label, "System")
	assert.equal(
		VOICE_CHOICES.some((id) => VOICE_PRESETS[id].label === "This Mac"),
		false,
	)
	assert.equal("browser" in VOICE_PRESETS, true)
})

test("Web Speech finals never become a realtime Voice-mode turn", () => {
	assert.equal(browserSpeechFinalSink({ voiceMode: true, noteListen: false, backend: "s2s" }), "ignore")
	assert.equal(browserSpeechFinalSink({ voiceMode: true, noteListen: true, backend: "s2s" }), "note")
	assert.equal(browserSpeechFinalSink({ voiceMode: false, noteListen: true, backend: "s2s" }), "note")
	assert.equal(browserSpeechFinalSink({ voiceMode: false, noteListen: false, backend: "s2s" }), "hold")
	assert.equal(browserSpeechFinalSink({ voiceMode: true, noteListen: false, backend: "browser" }), "send")
})

test("hold-to-speak and typed Mac speech stay off while Voice is live", () => {
	assert.equal(shouldStartHoldListen({ voiceMode: true, presence: "listening", noteListen: false }), false)
	assert.equal(shouldStartHoldListen({ voiceMode: false, presence: "idle", noteListen: false }), true)
	assert.equal(shouldStartHoldListen({ voiceMode: false, presence: "thinking", noteListen: false }), false)
	assert.equal(shouldSpeakTypedReply({ autoSpeak: true, voiceMode: true, backend: "s2s" }), false)
	assert.equal(shouldSpeakTypedReply({ autoSpeak: true, voiceMode: false, backend: "s2s" }), true)
	assert.equal(shouldSpeakTypedReply({ autoSpeak: false, voiceMode: false, backend: "s2s" }), false)
	assert.equal(shouldSpeakTypedReply({ autoSpeak: false, voiceMode: true, backend: "browser" }), true)
	assert.equal(shouldExitVoiceForComposer(true), true)
	assert.equal(shouldExitVoiceForComposer(false), false)
})

test("a dead sidecar turns Voice off so the next tap retries", () => {
	const failed = voiceUiAfterConnectError(connectFailureMessage("http://127.0.0.1:8765/v1"))
	assert.equal(failed.voiceMode, false)
	assert.equal(failed.presence, "idle")
	assert.match(failed.error ?? "", /Nothing is listening at http:\/\/127\.0\.0\.1:8765\/v1/)
	assert.match(failed.error ?? "", /tap Voice again/)

	const dropped = voiceUiAfterUnexpectedClose({
		voiceMode: true,
		presence: "speaking",
		error: null,
	})
	assert.equal(dropped.voiceMode, false)
	assert.equal(dropped.presence, "idle")
	assert.deepEqual(voiceUiAfterUnexpectedClose({ voiceMode: false, presence: "idle", error: null }), {
		voiceMode: false,
		presence: "idle",
		error: null,
	})
})

test("live captions never fall back to a previous assistant sentence", () => {
	assert.equal(displayVoiceCaption({ showCaptions: true, liveLine: "" }), "")
	assert.notEqual("" || "On it.", displayVoiceCaption({ showCaptions: true, liveLine: "" }))
})

test("Settings and Voice mode stay wired to the contract, not a second Speaker field", () => {
	const settingsSrc = [
		"src/components/settings-dialog.tsx",
		"src/components/settings-voice.tsx",
		"src/components/settings-speakers.tsx",
	]
		.map((p) => readFileSync(join(root, p), "utf8"))
		.join("\n")
	const shellSrc = ["src/components/assistant-shell.tsx", "src/components/assistant-status.tsx"]
		.map((p) => readFileSync(join(root, p), "utf8"))
		.join("\n")
	const voiceSrc = readFileSync(join(root, "src/components/settings-voice.tsx"), "utf8")
	const modelSrc = readFileSync(join(root, "src/components/settings-model.tsx"), "utf8")
	const modeSrc = readFileSync(join(root, "src/lib/voice-mode.ts"), "utf8")
	const storeSrc = ["src/lib/store.ts", "src/lib/store-turns.ts"]
		.map((p) => readFileSync(join(root, p), "utf8"))
		.join("\n")

	assert.match(settingsSrc, /VOICE_SETTINGS_COPY/)
	assert.match(settingsSrc, /conversationSpeaker/)
	assert.match(settingsSrc, /voiceBackend\.voice/)
	assert.match(settingsSrc, /settings\.voiceURI/)
	assert.match(settingsSrc, /await setVoiceBackendField/)
	assert.match(settingsSrc, /await applyVoiceBackend/)
	assert.match(settingsSrc, /id === "browser"/)
	assert.equal(settingsSrc.includes("<details"), false)
	assert.equal(settingsSrc.includes("typedSpeaker"), false)
	assert.equal(settingsSrc.includes("This Mac"), false)
	assert.equal(/Mac speaker/i.test(settingsSrc), false)
	assert.equal(settingsSrc.includes("Sidecar launch default"), false)
	assert.equal(/Pocket/i.test(settingsSrc), false)

	assert.match(shellSrc, /displayVoiceCaption/)
	assert.match(shellSrc, /browserSpeechFinalSink/)
	assert.match(shellSrc, /shouldExitVoiceForComposer/)
	assert.match(shellSrc, /shouldStartHoldListen/)
	assert.equal(shellSrc.includes("interim || caption"), false)
	assert.equal(shellSrc.includes("lastAssistant"), false)

	assert.match(modeSrc, /realtimeConnectFromSettings/)
	assert.match(modeSrc, /voiceUiAfterConnectError/)
	assert.match(modeSrc, /voiceUsesRealtime/)
	assert.match(modeSrc, /startListen/)
	assert.match(storeSrc, /shouldSpeakTypedReply/)
	assert.equal(/void run\("settings\.voice"/.test(storeSrc), false)
	assert.match(storeSrc, /run\("settings\.voice"/)
	assert.equal(VOICE_SETTINGS_COPY.conversationSpeaker, "Speaker")
	assert.match(voiceSrc, /label="Base URL"/)
	assert.match(modelSrc, /label="Base URL"/)
})

test("SpokenVoice waits for the store write before restarting Voice", () => {
	const speakersSrc = readFileSync(join(root, "src/components/settings-speakers.tsx"), "utf8")
	assert.match(speakersSrc, /await onChange/)
	assert.match(speakersSrc, /await onCommit/)
})

test("leftover audio and captions from a cancelled reply never play or commit", () => {
	let state = {
		...EMPTY_REALTIME_LOOP,
		outputPlaying: true,
		responseActive: true,
		currentResponseId: "resp_old",
		currentItemId: "item_old",
		queuedMs: 2000,
		playStartedAt: 1,
		now: 1.5,
		lastMicRms: 0.01,
	}
	const actions = []
	const events = [
		{ type: "input_audio_buffer.speech_started" },
		{ type: "response.output_audio.delta", response_id: "resp_old", delta: "stale-pcm" },
		{
			type: "response.output_audio_transcript.delta",
			response_id: "resp_old",
			delta: "leftover sentence the user already interrupted",
		},
		{ type: "response.done", response: { id: "resp_old" } },
		{ type: "response.created", response: { id: "resp_new" } },
		{ type: "response.output_audio.delta", response_id: "resp_new", delta: "fresh-pcm" },
		{
			type: "response.output_audio_transcript.delta",
			response_id: "resp_new",
			item_id: "item_new",
			delta: "New reply.",
		},
		{
			type: "response.output_audio_transcript.done",
			response_id: "resp_new",
			item_id: "item_new",
			transcript: "New reply.",
		},
		{ type: "response.done", response: { id: "resp_new" } },
	]
	for (const event of events) {
		const next = applyRealtimeEvent(state, event)
		state = next.state
		actions.push(...next.actions)
	}

	assert.ok(actions.some((action) => action.type === "flush"))
	assert.ok(actions.some((action) => action.type === "send" && action.event.type === "response.cancel"))
	assert.deepEqual(
		actions.filter((action) => action.type === "play").map((action) => action.audio),
		["fresh-pcm"],
	)
	assert.equal(
		actions.some((action) => action.type === "interim" && String(action.text).includes("leftover")),
		false,
	)
	assert.equal(
		actions.some((action) => action.type === "response_done" && action.text === "New reply."),
		true,
	)
	assert.equal(
		actions.some((action) => action.type === "response_done" && action.text.includes("leftover")),
		false,
	)
})
