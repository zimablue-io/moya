import { applyLocalIntent as applyEnvIntent, buildCapabilityPrompt, emptyUiState } from "./environment"
import type { Snapshot } from "./types"

export function buildSystemPrompt(snap: Snapshot, extra = ""): string {
	return buildCapabilityPrompt({ snapshot: snap, ui: emptyUiState() }, extra)
}

export async function applyLocalIntent(userText: string, snap: Snapshot) {
	return applyEnvIntent({ snapshot: snap, ui: emptyUiState() }, userText)
}

export function localFallback(userText: string, snap: Snapshot): string {
	const q = userText.toLowerCase()
	if (/what do you remember|memories|memory/.test(q)) {
		if (!snap.memories.length) return "Nothing durable yet. Tell me to remember something, or add it in Memory."
		return `I am holding ${snap.memories.length}. Open Memory to read them.`
	}
	if (/hello|hey|hi |good morning|good evening/.test(q)) {
		return "Here. Hold the core to talk, or type if you would rather."
	}
	return "The model is not connected, so I am running on local memory only. Add a provider in Settings when you want a full mind."
}
