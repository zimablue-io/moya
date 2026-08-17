import { APP_NAME } from "./brand.ts"
import type { ProviderId, VoiceBackendId } from "./types.ts"

export const PROVIDER_PRESETS: Record<ProviderId, { label: string; model: string; baseUrl: string; hint: string }> = {
	xai: {
		label: "xAI Grok",
		model: "grok-4.5",
		baseUrl: "https://api.x.ai/v1",
		hint: "Requires your xAI API key. Stored only on this device.",
	},
	openai: {
		label: "OpenAI",
		model: "gpt-4.1",
		baseUrl: "https://api.openai.com/v1",
		hint: "Requires your OpenAI API key.",
	},
	groq: {
		label: "Groq",
		model: "llama-3.3-70b-versatile",
		baseUrl: "https://api.groq.com/openai/v1",
		hint: "OpenAI-compatible. Paste a Groq key.",
	},
	openrouter: {
		label: "OpenRouter",
		model: "x-ai/grok-4.5",
		baseUrl: "https://openrouter.ai/api/v1",
		hint: "One key, many models.",
	},
	ollama: {
		label: "Ollama (local)",
		model: "qwen3:8b",
		baseUrl: "http://127.0.0.1:11434/v1",
		hint: `You run Ollama. ${APP_NAME} does not start it.`,
	},
	llamacpp: {
		label: "llama.cpp (local)",
		model: "",
		baseUrl: "http://127.0.0.1:8080/v1",
		hint: `You run llama-server. ${APP_NAME} does not start it. URL must end in /v1.`,
	},
	custom: {
		label: "Custom OpenAI-compatible",
		model: "",
		baseUrl: "http://127.0.0.1:1234/v1",
		hint: "Any OpenAI-compatible endpoint.",
	},
}

export const VOICE_PRESETS: Record<
	VoiceBackendId,
	{ label: string; model: string; baseUrl: string; voice: string; hint: string }
> = {
	s2s: {
		label: "Local",
		model: "local",
		baseUrl: "http://127.0.0.1:8765/v1",
		voice: "af_heart",
		hint: `You start speech-to-speech. ${APP_NAME} does not.`,
	},
	xai: {
		label: "Grok",
		model: "grok-voice-latest",
		baseUrl: "https://api.x.ai/v1",
		voice: "eve",
		hint: "Cloud. Uses your xAI key.",
	},
	openai: {
		label: "OpenAI",
		model: "gpt-realtime",
		baseUrl: "https://api.openai.com/v1",
		voice: "alloy",
		hint: "Cloud. Uses your OpenAI key.",
	},
	custom: {
		label: "Custom",
		model: "local",
		baseUrl: "http://127.0.0.1:8765/v1",
		voice: "",
		hint: "Any OpenAI Realtime URL.",
	},
}

export const POCKET_TTS_VOICES: { id: string; label: string; group?: string }[] = [
	{ id: "alba", label: "Alba", group: "Pocket" },
	{ id: "marius", label: "Marius", group: "Pocket" },
	{ id: "javert", label: "Javert", group: "Pocket" },
	{ id: "jean", label: "Jean", group: "Pocket" },
	{ id: "fantine", label: "Fantine", group: "Pocket" },
	{ id: "cosette", label: "Cosette", group: "Pocket" },
	{ id: "eponine", label: "Eponine", group: "Pocket" },
	{ id: "azelma", label: "Azelma", group: "Pocket" },
]

export const KOKORO_TTS_VOICES: { id: string; label: string; group?: string }[] = [
	{ id: "af_heart", label: "Heart · American woman", group: "Kokoro" },
	{ id: "af_bella", label: "Bella · American woman", group: "Kokoro" },
	{ id: "af_nicole", label: "Nicole · American woman", group: "Kokoro" },
	{ id: "af_sky", label: "Sky · American woman", group: "Kokoro" },
	{ id: "af_sarah", label: "Sarah · American woman", group: "Kokoro" },
	{ id: "am_michael", label: "Michael · American man", group: "Kokoro" },
	{ id: "am_adam", label: "Adam · American man", group: "Kokoro" },
	{ id: "bf_emma", label: "Emma · British woman", group: "Kokoro" },
	{ id: "bf_alice", label: "Alice · British woman", group: "Kokoro" },
	{ id: "bm_fable", label: "Fable · British man", group: "Kokoro" },
	{ id: "bm_george", label: "George · British man", group: "Kokoro" },
]

export const REALTIME_VOICES: Record<VoiceBackendId, { id: string; label: string; group?: string }[]> = {
	s2s: [...KOKORO_TTS_VOICES, ...POCKET_TTS_VOICES],
	xai: [
		{ id: "eve", label: "Eve" },
		{ id: "ara", label: "Ara" },
		{ id: "leo", label: "Leo" },
		{ id: "rex", label: "Rex" },
		{ id: "sal", label: "Sal" },
	],
	openai: [
		{ id: "alloy", label: "Alloy" },
		{ id: "ash", label: "Ash" },
		{ id: "ballad", label: "Ballad" },
		{ id: "cedar", label: "Cedar" },
		{ id: "coral", label: "Coral" },
		{ id: "echo", label: "Echo" },
		{ id: "marin", label: "Marin" },
		{ id: "sage", label: "Sage" },
		{ id: "shimmer", label: "Shimmer" },
		{ id: "verse", label: "Verse" },
	],
	custom: [],
}

export const VOICE_CHOICES: VoiceBackendId[] = ["s2s", "xai", "openai"]

const PROVIDER_IDS = new Set<string>(Object.keys(PROVIDER_PRESETS))
const VOICE_BACKEND_IDS = new Set<string>(Object.keys(VOICE_PRESETS))

export function speakersFor(id: VoiceBackendId): { id: string; label: string }[] {
	return REALTIME_VOICES[id]
}

export function llamaCppBaseUrl(port: number): string {
	return `http://127.0.0.1:${port}/v1`
}

export function isProviderId(value: string): value is ProviderId {
	return PROVIDER_IDS.has(value)
}

export function isVoiceBackendId(value: string): value is VoiceBackendId {
	return VOICE_BACKEND_IDS.has(value)
}
