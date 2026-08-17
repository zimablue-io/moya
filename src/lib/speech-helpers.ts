import { micBlockedInSettings } from "./brand"
import { systemSettingsLabel } from "./host"

export type Recog = {
	continuous: boolean
	interimResults: boolean
	lang: string
	start: () => void
	stop: () => void
	abort: () => void
	onresult: ((ev: RecogEvent) => void) | null
	onerror: ((ev: { error?: string }) => void) | null
	onend: (() => void) | null
}

export type RecogEvent = {
	resultIndex: number
	results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

export function getRecognizerCtor(): (new () => Recog) | null {
	if (typeof window === "undefined") return null
	const w = window as Window & {
		SpeechRecognition?: new () => Recog
		webkitSpeechRecognition?: new () => Recog
	}
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function envelopeFromText(text: string): number[] {
	const out: number[] = []
	for (const ch of text) {
		if (/[aeiouáéíóúy]/i.test(ch)) out.push(0.85 + Math.random() * 0.15)
		else if (/[mnlrw]/i.test(ch)) out.push(0.55)
		else if (/\s/.test(ch)) out.push(0.08)
		else if (/[.,!?;:]/.test(ch)) out.push(0.02)
		else out.push(0.32 + Math.random() * 0.15)
	}
	return out.length ? out : [0.2]
}

export function friendlySpeechError(code: string): string | null {
	if (code === "aborted" || code === "no-speech") return null
	if (code === "not-allowed" || code === "service-not-allowed") {
		return micBlockedInSettings(systemSettingsLabel())
	}
	if (code === "network" || code === "service-not-connected") {
		return "Speech service is offline. Type instead."
	}
	if (code === "audio-capture") return "No microphone found. Type instead."
	return null
}

export function livingBands(t: number): number[] {
	const swell = 0.16 + 0.04 * Math.sin(t * 0.62)
	return Array.from({ length: 24 }, (_, i) => swell + 0.015 * Math.sin(t * 0.3 + i * 0.2))
}

export function padBands(bands: number[]): number[] {
	const out = bands.slice(0, 24)
	while (out.length < 24) out.push(out[out.length - 1] ?? 0.18)
	return out
}
