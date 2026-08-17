export type SpeakerOption = { id: string; label: string }

export const POCKET_VOICE_TREE_URL =
	"https://huggingface.co/api/models/kyutai/pocket-tts-without-voice-cloning/tree/main/embeddings"

export type CatalogFetch = (
	url: string | URL,
	init?: RequestInit,
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>

export function titleCaseVoice(id: string): string {
	if (!id) return id
	return id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " ")
}

export function parseTtsVoices(json: unknown): SpeakerOption[] {
	return parseVoiceList(json)
}

export function parsePocketVoiceTree(json: unknown): SpeakerOption[] {
	if (!Array.isArray(json)) return []
	const out: SpeakerOption[] = []
	const seen = new Set<string>()
	for (const row of json) {
		if (!row || typeof row !== "object") continue
		const rec = row as { type?: unknown; path?: unknown }
		if (rec.type && rec.type !== "file") continue
		if (typeof rec.path !== "string") continue
		const file = rec.path.split("/").pop() ?? ""
		const id = file.replace(/\.(safetensors|wav)$/i, "")
		if (!id || id === file || seen.has(id)) continue
		seen.add(id)
		out.push({ id, label: titleCaseVoice(id) })
	}
	return out
}

export async function listRealtimeSpeakers(
	voice: { id: string; baseUrl: string; apiKey: string },
	deps?: { fetch?: CatalogFetch; fallback?: SpeakerOption[] },
): Promise<SpeakerOption[]> {
	const fallback = deps?.fallback ?? []
	const get = deps?.fetch ?? fetch
	if (voice.id === "xai") {
		const listed = parseTtsVoices(
			await fetchJson(get, `${httpBase(voice.baseUrl)}/tts/voices`, {
				headers: voice.apiKey ? { Authorization: `Bearer ${voice.apiKey}` } : {},
			}),
		)
		return listed.length ? listed : fallback
	}
	if (voice.id === "s2s" || voice.id === "custom") {
		const sidecar = parseVoiceList(await fetchJson(get, `${httpBase(voice.baseUrl)}/voices`))
		if (sidecar.length) return sidecar
		const tree = parsePocketVoiceTree(await fetchJson(get, POCKET_VOICE_TREE_URL))
		return tree.length ? tree : fallback
	}
	return fallback
}

function httpBase(baseUrl: string): string {
	return baseUrl
		.trim()
		.replace(/\/+$/, "")
		.replace(/\/realtime$/i, "")
}

function parseVoiceList(json: unknown): SpeakerOption[] {
	if (!json || typeof json !== "object") return []
	const rec = json as Record<string, unknown>
	const raw = Array.isArray(rec.voices) ? rec.voices : Array.isArray(rec.speakers) ? rec.speakers : []
	const out: SpeakerOption[] = []
	const seen = new Set<string>()
	for (const row of raw) {
		let id = ""
		let label = ""
		if (typeof row === "string") {
			id = row.trim()
			label = titleCaseVoice(id)
		} else if (row && typeof row === "object") {
			const item = row as Record<string, unknown>
			id = String(item.voice_id ?? item.id ?? "").trim()
			label = String(item.name ?? item.label ?? "").trim() || titleCaseVoice(id)
		}
		if (!id || seen.has(id)) continue
		seen.add(id)
		out.push({ id, label })
	}
	return out
}

async function fetchJson(get: CatalogFetch, url: string, init?: RequestInit): Promise<unknown> {
	try {
		const res = await get(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(8000) })
		if (!res.ok) return null
		return await res.json()
	} catch {
		return null
	}
}
