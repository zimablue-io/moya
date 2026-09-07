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
	PROVIDER_PRESETS,
	providerChoicesForHost,
	settingsForHost,
	speakerGender,
	speakersFor,
	VOICE_CHOICES,
	VOICE_PRESETS,
	voiceChoicesForHost,
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
	shouldStartHoldListen,
	VOICE_SETTINGS_COPY,
	voiceUiAfterConnectError,
	voiceUiAfterUnexpectedClose,
} from "../src/lib/voice-contract.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const LOCAL_VOICE = {
	id: "s2s",
	model: "local",
	baseUrl: "http://127.0.0.1:8765/v1",
	apiKey: "",
	voice: "af_heart",
}

function settings(partial = {}) {
	return normalizeSettings({ ...DEFAULT_SETTINGS, ...partial })
}

test("Voice lists the provider catalog with a gender icon, not System TTS", () => {
	const heart = KOKORO_TTS_VOICES.find((v) => v.id === "af_heart")
	assert.equal(heart?.label, "Heart")
	assert.equal(speakerGender("af_heart"), "woman")
	assert.equal(speakerGender("am_adam"), "man")
	assert.equal(speakerGender("eve"), "woman")
	assert.equal(speakerGender("leo"), "man")
	const picker = readFileSync(join(root, "src/components/settings-speakers.tsx"), "utf8")
	assert.match(picker, /SpokenVoice/)
	assert.match(picker, /Venus/)
	assert.match(picker, /Mars/)
	assert.match(picker, /speakerGender/)
	assert.equal(picker.includes("SystemVoicePicker"), false)
	assert.equal(picker.includes("curateSystemVoices"), false)
	const voiceSrc = readFileSync(join(root, "src/components/settings-voice.tsx"), "utf8")
	assert.match(voiceSrc, /SpokenVoice/)
	assert.equal(voiceSrc.includes("SystemVoicePicker"), false)
	assert.equal(voiceSrc.includes("SPEECH_RATE"), false)
	assert.equal(voiceSrc.includes("SPEECH_PITCH"), false)
	assert.equal(voiceSrc.includes("Speak typed replies"), false)
	assert.match(picker, /size="icon"/)
	assert.match(picker, /Hear this voice/)
	assert.match(picker, /<Play /)
	assert.match(picker, /<Square /)
	assert.match(picker, /className="flex gap-2"/)
	assert.match(picker, /SelectTrigger className="min-w-0 w-auto flex-1"/)
	assert.match(picker, /voicePreviewPlan/)
	assert.equal(voiceSrc.includes('<Field label="Model">'), false)
	assert.match(voiceSrc, /label="Realtime model"/)
	assert.equal(voiceSrc.includes("speech.speak"), false)
	assert.equal(picker.includes("speech.speak"), false)
	const onboard = readFileSync(join(root, "src/components/setup-sheet.tsx"), "utf8")
	assert.match(onboard, /<VoiceTab/)
	assert.equal(onboard.includes("SystemVoicePicker"), false)
})

test("Hear this voice keeps playing after the Realtime response ends", () => {
	const picker = readFileSync(join(root, "src/components/settings-speakers.tsx"), "utf8")
	assert.equal(/onDone:\s*\(\)\s*=>\s*stop\(\)/.test(picker), false)
	assert.match(picker, /onIdle/)
	assert.match(picker, /queueRef\.current\.flush\(\)/)
})

test("Voice mode sends Conversation speaker, never a system voiceURI", () => {
	const stored = settings({
		voiceBackend: { ...LOCAL_VOICE, voice: "af_bella" },
	})
	assert.equal(conversationVoice(stored), "af_bella")
	assert.equal(realtimeConnectFromSettings(stored).voice, "af_bella")
	const event = sessionUpdateFromSettings(stored)
	assert.equal(sessionOutputVoice(event), "af_bella")
	assert.equal(JSON.stringify(event).includes("voiceURI"), false)
})

test("empty Local voice still sends Kokoro Heart so the sidecar cannot stay on bm_fable", () => {
	const empty = settings({
		voiceBackend: { ...LOCAL_VOICE, voice: "" },
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
		voiceBackend: { ...LOCAL_VOICE, voice: "jean" },
	})
	assert.equal(pocket.voiceBackend.voice, "af_heart")
	assert.equal(conversationVoice(pocket), "af_heart")
	assert.equal(sessionOutputVoice(sessionUpdateFromSettings(pocket)), "af_heart")
	assert.ok(POCKET_TTS_VOICES.some((v) => v.id === "jean"))
	assert.ok(KOKORO_TTS_VOICES.some((v) => v.id === "af_heart"))
	assert.equal(
		sessionOutputVoice(sessionUpdateFromSettings(settings({ voiceBackend: { ...LOCAL_VOICE, voice: "af_bella" } }))),
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
	assert.equal(DEFAULT_SETTINGS.voiceBackend.id, "custom")
	assert.match(VOICE_SETTINGS_COPY.conversationTipLocal, /Kokoro/)
	assert.equal(/Pocket/i.test(VOICE_SETTINGS_COPY.conversationTipLocal), false)
})

test("switching provider to Local resets Conversation speaker to Heart", () => {
	assert.equal(VOICE_PRESETS.s2s.voice, "af_heart")
	assert.equal(VOICE_PRESETS.custom.voice, "")
})

test("Local speakers are the Kokoro catalog — the sidecar is not asked for /voices", async () => {
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
	assert.deepEqual(urls, [])
	assert.ok(listed.some((v) => v.id === "af_heart"))
	assert.equal(
		listed.some((v) => v.id === "jean"),
		false,
	)
	assert.equal(
		urls.some((url) => url === POCKET_VOICE_TREE_URL),
		false,
	)
})

test("OpenAI uses the documented Realtime voices; only xAI lists from GET /tts/voices", async () => {
	const openaiUrls = []
	const fromOpenAi = await listRealtimeSpeakers(
		{ id: "custom", baseUrl: "https://api.openai.com/v1", apiKey: "sk" },
		{
			fallback: speakersFor("custom", "https://api.openai.com/v1"),
			fetch: async (url) => {
				openaiUrls.push(String(url))
				return {
					ok: true,
					json: async () => ({ voices: [{ id: "bogus", name: "Bogus" }] }),
				}
			},
		},
	)
	assert.deepEqual(openaiUrls, [])
	assert.ok(fromOpenAi.some((v) => v.id === "marin"))
	assert.equal(
		fromOpenAi.some((v) => v.id === "bogus"),
		false,
	)

	const xaiUrls = []
	const fromXai = await listRealtimeSpeakers(
		{ id: "custom", baseUrl: "https://api.x.ai/v1", apiKey: "sk" },
		{
			fallback: speakersFor("custom", "https://api.x.ai/v1"),
			fetch: async (url) => {
				xaiUrls.push(String(url))
				return {
					ok: true,
					json: async () => ({
						voices: [
							{ voice_id: "eve", name: "Eve" },
							{ voice_id: "ara", name: "Ara" },
						],
					}),
				}
			},
		},
	)
	assert.deepEqual(xaiUrls, ["https://api.x.ai/v1/tts/voices"])
	assert.deepEqual(
		fromXai.map((v) => v.id),
		["eve", "ara"],
	)

	const customUrls = []
	const fromCustom = await listRealtimeSpeakers(
		{ id: "custom", baseUrl: "https://proxy.example/v1", apiKey: "k" },
		{
			fetch: async (url) => {
				customUrls.push(String(url))
				return { ok: true, json: async () => ({ voices: ["Ryan", "Vivian"] }) }
			},
		},
	)
	assert.deepEqual(customUrls, [])
	assert.deepEqual(fromCustom, [])
})

test("Voice tab offers Local and Custom — names match Model", () => {
	assert.deepEqual(VOICE_CHOICES, ["s2s", "custom"])
	assert.equal("xai" in VOICE_PRESETS, false)
	assert.equal("openai" in VOICE_PRESETS, false)
	assert.equal("browser" in VOICE_PRESETS, false)
	assert.equal(VOICE_CHOICES.includes("browser"), false)
	assert.equal(VOICE_PRESETS.custom.label, PROVIDER_PRESETS.custom.label)
	assert.equal(PROVIDER_PRESETS.xai.label, "xAI Grok")
	assert.equal(VOICE_PRESETS.s2s.label, "Local")
	assert.equal(DEFAULT_SETTINGS.voiceBackend.id, "custom")
	assert.equal(DEFAULT_SETTINGS.voiceBackend.baseUrl, "")
	assert.equal(DEFAULT_SETTINGS.voiceBackend.voice, "")
})

test("web omits Local voice, Ollama, and llama.cpp; desktop keeps them", () => {
	assert.deepEqual(voiceChoicesForHost(true), VOICE_CHOICES)
	assert.equal(voiceChoicesForHost(false).includes("s2s"), false)
	assert.deepEqual(voiceChoicesForHost(false), ["custom"])
	assert.equal(providerChoicesForHost(true).includes("ollama"), true)
	assert.equal(providerChoicesForHost(true).includes("llamacpp"), true)
	assert.equal(providerChoicesForHost(false).includes("ollama"), false)
	assert.equal(providerChoicesForHost(false).includes("llamacpp"), false)
	assert.equal(providerChoicesForHost(false).includes("custom"), true)
	assert.equal(settingsForHost(DEFAULT_SETTINGS, false).voiceBackend.id, "custom")
	assert.equal(settingsForHost(DEFAULT_SETTINGS, true).voiceBackend.id, "custom")
	assert.equal(settingsForHost(normalizeSettings({ voiceBackend: LOCAL_VOICE }), true).voiceBackend.id, "s2s")
	const onDeviceDesktop = { desktopOs: true, onDeviceLlm: true }
	assert.equal(voiceChoicesForHost(onDeviceDesktop).includes("s2s"), true)
	assert.equal(voiceChoicesForHost(onDeviceDesktop).includes("browser"), false)
	assert.deepEqual(voiceChoicesForHost(onDeviceDesktop), ["s2s", "custom"])
	assert.equal(
		settingsForHost(normalizeSettings({ voiceBackend: LOCAL_VOICE }), onDeviceDesktop).voiceBackend.id,
		"s2s",
	)
	assert.equal(normalizeSettings({ voiceBackend: { id: "browser" } }).voiceBackend.id, "custom")
	assert.equal(
		settingsForHost(
			normalizeSettings({ provider: { id: "ollama", model: "qwen3:8b", baseUrl: "http://127.0.0.1:11434/v1" } }),
			false,
		).provider.id,
		"custom",
	)
	assert.equal(
		settingsForHost(
			normalizeSettings({ provider: { id: "llamacpp", model: "qwen3", baseUrl: "http://127.0.0.1:8080/v1" } }),
			true,
		).provider.id,
		"llamacpp",
	)
})

test("Web Speech finals never become a realtime Voice-mode turn", () => {
	assert.equal(browserSpeechFinalSink({ voiceMode: true, noteListen: false, backend: "s2s" }), "ignore")
	assert.equal(browserSpeechFinalSink({ voiceMode: true, noteListen: true, backend: "s2s" }), "note")
	assert.equal(browserSpeechFinalSink({ voiceMode: false, noteListen: true, backend: "s2s" }), "note")
	assert.equal(browserSpeechFinalSink({ voiceMode: false, noteListen: false, backend: "s2s" }), "hold")
})

test("hold-to-speak stays off while Voice is live", () => {
	assert.equal(shouldStartHoldListen({ voiceMode: true, presence: "listening", noteListen: false }), false)
	assert.equal(shouldStartHoldListen({ voiceMode: false, presence: "idle", noteListen: false }), true)
	assert.equal(shouldStartHoldListen({ voiceMode: false, presence: "thinking", noteListen: false }), false)
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
	assert.match(settingsSrc, /voiceBackend/)
	assert.match(settingsSrc, /voiceChoicesForHost/)
	assert.match(settingsSrc, /await setVoiceBackendField/)
	assert.match(settingsSrc, /await applyVoiceBackend/)
	assert.equal(settingsSrc.includes("SystemVoicePicker"), false)
	assert.equal(settingsSrc.includes('id === "browser"'), false)
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
	const statusSrc = readFileSync(join(root, "src/components/assistant-status.tsx"), "utf8")
	assert.match(statusSrc, /s\.caption/)
	assert.match(readFileSync(join(root, "src/lib/store-turns.ts"), "utf8"), /error:\s*result\.error\s*\?\?\s*null/)

	assert.match(modeSrc, /realtimeConnectFromSettings/)
	assert.match(modeSrc, /liveSettings/)
	assert.match(modeSrc, /voiceUiAfterConnectError/)
	assert.equal(modeSrc.includes("voiceUsesRealtime"), false)
	assert.equal(storeSrc.includes("shouldSpeakTypedReply"), false)
	assert.equal(storeSrc.includes("typedReplyVoice"), false)
	assert.equal(storeSrc.includes("speech.speak"), false)
	assert.match(storeSrc, /liveSettings/)
	assert.match(storeSrc, /hostCaps\(\)\.onDeviceLlm/)
	assert.match(storeSrc, /isLocalOnlyProvider/)
	assert.equal(/void run\("settings\.voice"/.test(storeSrc), false)
	assert.match(storeSrc, /run\("settings\.voice"/)
	assert.equal(VOICE_SETTINGS_COPY.conversationSpeaker, "Voice")
	assert.match(voiceSrc, /label="Base URL"/)
	assert.match(voiceSrc, /label="Realtime model"/)
	assert.match(voiceSrc, /voiceChoicesForHost/)
	assert.match(voiceSrc, /id === "custom"/)
	assert.match(modelSrc, /label="Base URL"/)
	assert.match(modelSrc, /providerChoicesForHost/)
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
