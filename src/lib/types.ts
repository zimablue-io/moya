import { APP_NAME } from "./brand.ts"

export type Emotion = "calm" | "focused" | "alert" | "warm" | "concerned"
export type PresenceState = "idle" | "listening" | "thinking" | "speaking"
export type Role = "user" | "assistant" | "system" | "tool"
export type InboxSeverity = "info" | "need" | "urgent"
export type BoardItemState = "watching" | "running" | "blocked" | "idle" | "done"
export type MemoryKind = "fact" | "preference" | "decision" | "project" | "insight"

export type ProviderId = "xai" | "openai" | "groq" | "openrouter" | "ollama" | "llamacpp" | "custom"

export type VoiceBackendId = "browser" | "s2s" | "xai" | "openai" | "custom"

export type DialogId = "history" | "watch" | "settings" | "artifact" | "memory" | "routines" | null

export interface ProviderConfig {
	id: ProviderId
	model: string
	baseUrl: string
	apiKey: string
}

export interface VoiceConfig {
	id: VoiceBackendId
	model: string
	baseUrl: string
	apiKey: string
	voice: string
}

export interface Settings {
	agentName: string
	userName: string
	brief: string
	autoSpeak: boolean
	voiceURI: string
	rate: number
	pitch: number
	showCaptions: boolean
	provider: ProviderConfig
	voiceBackend: VoiceConfig
}

export interface ArtifactNode {
	id: string
	label: string
}

export interface ArtifactEdge {
	from: string
	to: string
	label?: string
}

export interface ArtifactStatusItem {
	label: string
	value: string
	tone?: "ok" | "warn" | "alert" | "neutral"
}

export interface ArtifactChartPoint {
	x: string
	y: number
}

export type Artifact =
	| { type: "status"; title: string; items: ArtifactStatusItem[] }
	| {
			type: "chart"
			title: string
			series: { name: string; points: ArtifactChartPoint[] }[]
	  }
	| { type: "diagram"; title: string; nodes: ArtifactNode[]; edges: ArtifactEdge[] }
	| { type: "brief"; title: string; body: string; actions?: { id: string; label: string }[] }
	| { type: "note"; title: string; body: string }

export interface Message {
	id: string
	role: Role
	content: string
	createdAt: string
	emotion?: Emotion
	artifacts?: Artifact[]
	toolName?: string
	hidden?: boolean
}

export interface Memory {
	id: string
	kind: MemoryKind
	text: string
	weight: number
	pinned: boolean
	createdAt: string
	lastUsedAt: string
}

export interface InboxItem {
	id: string
	title: string
	body: string
	source: string
	severity: InboxSeverity
	createdAt: string
	resolvedAt: string | null
}

export interface BoardItem {
	id: string
	label: string
	state: BoardItemState
	note: string
	needsInput: boolean
}

export interface Board {
	id: string
	name: string
	summary: string
	items: BoardItem[]
	updatedAt: string
}

export interface TimeLog {
	id: string
	startedAt: string
	endedAt: string
	category: string
	note: string
}

export interface Insight {
	id: string
	title: string
	body: string
	createdAt: string
}

export type AutomationTrigger =
	| { type: "manual" }
	| { type: "interval"; everyMinutes: number }
	| { type: "daily"; hour: number; minute: number }
	| { type: "phrase"; pattern: string }

export interface Automation {
	id: string
	name: string
	brief: string
	enabled: boolean
	trigger: AutomationTrigger
	lastRunAt: string | null
	lastResult: string
	createdAt: string
}

export interface McpServer {
	id: string
	name: string
	url: string
	authHeader: string
	enabled: boolean
	sessionId?: string
	tools: McpTool[]
	lastError?: string
	lastOkAt?: string
}

export interface McpTool {
	name: string
	description: string
	inputSchema?: Record<string, unknown>
	serverId: string
}

export interface Snapshot {
	version: 1
	settings: Settings
	messages: Message[]
	memories: Memory[]
	inbox: InboxItem[]
	boards: Board[]
	timeLogs: TimeLog[]
	insights: Insight[]
	mcpServers: McpServer[]
	automations: Automation[]
}

export const DEFAULT_SETTINGS: Settings = {
	agentName: APP_NAME,
	userName: "",
	brief: "",
	autoSpeak: true,
	voiceURI: "",
	rate: 1,
	pitch: 1,
	showCaptions: true,
	provider: {
		id: "xai",
		model: "grok-4.5",
		baseUrl: "https://api.x.ai/v1",
		apiKey: "",
	},
	voiceBackend: {
		id: "browser",
		model: "",
		baseUrl: "",
		apiKey: "",
		voice: "",
	},
}

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

export const MEMORY_KINDS: { id: MemoryKind; label: string }[] = [
	{ id: "fact", label: "Fact" },
	{ id: "preference", label: "Preference" },
	{ id: "decision", label: "Decision" },
	{ id: "project", label: "Project" },
	{ id: "insight", label: "Insight" },
]

export const VOICE_PRESETS: Record<
	VoiceBackendId,
	{ label: string; model: string; baseUrl: string; voice: string; hint: string }
> = {
	browser: {
		label: "System",
		model: "",
		baseUrl: "",
		voice: "",
		hint: "Voices already on this device.",
	},
	s2s: {
		label: "Local",
		model: "local",
		baseUrl: "http://127.0.0.1:8765/v1",
		voice: "",
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

export const POCKET_TTS_VOICES: { id: string; label: string }[] = [
	{ id: "alba", label: "Alba" },
	{ id: "marius", label: "Marius" },
	{ id: "javert", label: "Javert" },
	{ id: "jean", label: "Jean" },
	{ id: "fantine", label: "Fantine" },
	{ id: "cosette", label: "Cosette" },
	{ id: "eponine", label: "Eponine" },
	{ id: "azelma", label: "Azelma" },
]

export const REALTIME_VOICES: Record<VoiceBackendId, { id: string; label: string }[]> = {
	browser: [],
	s2s: POCKET_TTS_VOICES,
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

export const VOICE_CHOICES: VoiceBackendId[] = ["browser", "s2s", "xai", "openai"]

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

export function usesRealtimeVoice(id: VoiceBackendId): boolean {
	return id !== "browser"
}

export function normalizeSettings(raw: unknown): Settings {
	const s = (raw ?? {}) as Partial<Settings> & { engine?: { port?: number } }
	const rawEngine = s.engine ?? {}
	const rawProvider = (s.provider ?? {}) as Partial<ProviderConfig>
	const rawId = rawProvider.id ?? ""
	const id = isProviderId(rawId) ? rawId : DEFAULT_SETTINGS.provider.id
	const preset = PROVIDER_PRESETS[id]
	const storedUrl = rawProvider.baseUrl?.trim() ?? ""
	const legacyPort = Number(rawEngine.port) || 0
	const provider: ProviderConfig = {
		id,
		model: rawProvider.model?.trim() || (id === "llamacpp" ? "" : preset.model),
		baseUrl: storedUrl || (id === "llamacpp" && legacyPort ? llamaCppBaseUrl(legacyPort) : preset.baseUrl),
		apiKey: rawProvider.apiKey ?? DEFAULT_SETTINGS.provider.apiKey,
	}

	const rawVoice = (s.voiceBackend ?? {}) as Partial<VoiceConfig>
	const rawVoiceId = rawVoice.id === "custom" ? "s2s" : (rawVoice.id ?? "")
	const voiceId = isVoiceBackendId(rawVoiceId) ? rawVoiceId : DEFAULT_SETTINGS.voiceBackend.id
	const voicePreset = VOICE_PRESETS[voiceId]
	const voiceBackend: VoiceConfig = {
		id: voiceId,
		model: rawVoice.model?.trim() || voicePreset.model,
		baseUrl: rawVoice.baseUrl?.trim() || voicePreset.baseUrl,
		apiKey: rawVoice.apiKey ?? DEFAULT_SETTINGS.voiceBackend.apiKey,
		voice: rawVoice.voice?.trim() || voicePreset.voice,
	}

	return {
		agentName: s.agentName ?? DEFAULT_SETTINGS.agentName,
		userName: s.userName ?? DEFAULT_SETTINGS.userName,
		brief: s.brief ?? DEFAULT_SETTINGS.brief,
		autoSpeak: s.autoSpeak ?? DEFAULT_SETTINGS.autoSpeak,
		voiceURI: s.voiceURI ?? DEFAULT_SETTINGS.voiceURI,
		rate: s.rate ?? DEFAULT_SETTINGS.rate,
		pitch: s.pitch ?? DEFAULT_SETTINGS.pitch,
		showCaptions: s.showCaptions ?? DEFAULT_SETTINGS.showCaptions,
		provider,
		voiceBackend,
	}
}

export function normalizeArtifact(raw: unknown): Artifact | null {
	if (!raw || typeof raw !== "object") return null
	const a = raw as Record<string, unknown>
	const type = String(a.type ?? "")
	const title = asString(a.title, "Untitled")
	if (type === "status") {
		return { type: "status", title, items: parseStatusItems(a.items) }
	}
	if (type === "chart") {
		return { type: "chart", title, series: parseChartSeries(a.series) }
	}
	if (type === "diagram") {
		const nested = asRecord(a.graph) ?? asRecord(a.data) ?? {}
		const nodes = parseNodes(a.nodes ?? nested.nodes ?? a.elements)
		const edges = parseEdges(a.edges ?? a.connections ?? a.links ?? nested.edges ?? nested.connections ?? nested.links)
		return { type: "diagram", title, nodes, edges }
	}
	if (type === "brief" || type === "note") {
		return { type, title, body: asString(a.body) }
	}
	return null
}

export function normalizeArtifacts(raw: unknown): Artifact[] | undefined {
	if (raw == null) return undefined
	const list = Array.isArray(raw) ? raw : [raw]
	const artifacts = list.map(normalizeArtifact).filter((a): a is Artifact => a != null)
	return artifacts.length ? artifacts : undefined
}

const BOARD_STATES = new Set<string>(["watching", "running", "blocked", "idle", "done"])
const ROLES = new Set<string>(["user", "assistant", "system", "tool"])

export function normalizeSnapshot(raw: unknown): Snapshot {
	const s = asRecord(raw) ?? {}
	return {
		version: 1,
		settings: normalizeSettings(s.settings),
		messages: asArray(s.messages)
			.map(normalizeMessage)
			.filter((m): m is Message => m != null),
		memories: asArray(s.memories) as Memory[],
		inbox: asArray(s.inbox) as InboxItem[],
		boards: asArray(s.boards)
			.map(normalizeBoard)
			.filter((b): b is Board => b != null),
		timeLogs: asArray(s.timeLogs) as TimeLog[],
		insights: asArray(s.insights) as Insight[],
		mcpServers: asArray(s.mcpServers)
			.map(normalizeMcpServer)
			.filter((m): m is McpServer => m != null),
		automations: asArray(s.automations) as Automation[],
	}
}

function normalizeMessage(raw: unknown): Message | null {
	const m = asRecord(raw)
	if (!m) return null
	const role = String(m.role ?? "")
	if (!ROLES.has(role)) return null
	return {
		id: asString(m.id, "msg"),
		role: role as Message["role"],
		content: asString(m.content),
		createdAt: asString(m.createdAt),
		emotion: typeof m.emotion === "string" ? (m.emotion as Message["emotion"]) : undefined,
		artifacts: normalizeArtifacts(m.artifacts),
		toolName: m.toolName ? asString(m.toolName) : undefined,
		hidden: Boolean(m.hidden),
	}
}

function normalizeBoard(raw: unknown): Board | null {
	const b = asRecord(raw)
	if (!b) return null
	return {
		id: asString(b.id) || asString(b.name, "board"),
		name: asString(b.name, "Board"),
		summary: asString(b.summary),
		updatedAt: asString(b.updatedAt),
		items: asArray(b.items).flatMap((it, i) => {
			const o = asRecord(it)
			if (!o) return []
			const state = String(o.state ?? "")
			return [
				{
					id: asString(o.id, `bi${i}`),
					label: asString(o.label, "Item"),
					state: (BOARD_STATES.has(state) ? state : "watching") as BoardItemState,
					note: asString(o.note),
					needsInput: Boolean(o.needsInput),
				},
			]
		}),
	}
}

function normalizeMcpServer(raw: unknown): McpServer | null {
	const s = asRecord(raw)
	if (!s) return null
	const id = asString(s.id) || asString(s.name, "mcp")
	return {
		id,
		name: asString(s.name, "Server"),
		url: asString(s.url),
		authHeader: asString(s.authHeader),
		enabled: Boolean(s.enabled),
		sessionId: s.sessionId ? asString(s.sessionId) : undefined,
		tools: asArray(s.tools).flatMap((t) => {
			const o = asRecord(t)
			if (!o) return []
			const name = asString(o.name)
			if (!name) return []
			return [
				{
					name,
					description: asString(o.description),
					inputSchema: asRecord(o.inputSchema) ?? undefined,
					serverId: asString(o.serverId, id),
				},
			]
		}),
		lastError: s.lastError ? asString(s.lastError) : undefined,
		lastOkAt: s.lastOkAt ? asString(s.lastOkAt) : undefined,
	}
}

function asArray(raw: unknown): unknown[] {
	return Array.isArray(raw) ? raw : []
}

function asRecord(raw: unknown): Record<string, unknown> | null {
	return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

function asString(raw: unknown, fallback = ""): string {
	if (typeof raw === "string") return raw
	if (typeof raw === "number" || typeof raw === "boolean") return String(raw)
	return fallback
}

function parseStatusItems(raw: unknown): ArtifactStatusItem[] {
	if (!Array.isArray(raw)) return []
	return raw.flatMap((item) => {
		const o = asRecord(item)
		if (!o) return []
		const label = asString(o.label)
		const value = asString(o.value)
		if (!label && !value) return []
		const tone = o.tone
		const itemOut: ArtifactStatusItem = { label: label || "Item", value }
		if (tone === "ok" || tone === "warn" || tone === "alert" || tone === "neutral") itemOut.tone = tone
		return [itemOut]
	})
}

function parseChartSeries(raw: unknown): { name: string; points: ArtifactChartPoint[] }[] {
	if (!Array.isArray(raw)) return []
	return raw.flatMap((series) => {
		const o = asRecord(series)
		if (!o) return []
		const points = Array.isArray(o.points)
			? o.points.flatMap((p) => {
					const pt = asRecord(p)
					if (!pt) return []
					const y = Number(pt.y)
					if (!Number.isFinite(y)) return []
					return [{ x: asString(pt.x), y }]
				})
			: []
		return [{ name: asString(o.name, "Series"), points }]
	})
}

function parseNodes(raw: unknown): ArtifactNode[] {
	if (Array.isArray(raw)) {
		return raw.map((node, i) => {
			if (typeof node === "string") return { id: node, label: node }
			const o = asRecord(node) ?? {}
			const id = asString(o.id ?? o.key ?? o.name, `n${i}`)
			return { id, label: asString(o.label ?? o.name ?? o.title ?? o.text, id) }
		})
	}
	const o = asRecord(raw)
	if (!o) return []
	return Object.entries(o).map(([id, value]) => {
		const nested = asRecord(value)
		if (nested) {
			return { id: asString(nested.id, id), label: asString(nested.label ?? nested.name ?? nested.title, id) }
		}
		return { id, label: asString(value, id) }
	})
}

function parseEdges(raw: unknown): ArtifactEdge[] {
	if (!Array.isArray(raw)) return []
	return raw.flatMap((edge) => {
		const o = asRecord(edge)
		if (!o) return []
		const from = asString(o.from ?? o.source ?? o.src ?? o.start)
		const to = asString(o.to ?? o.target ?? o.dst ?? o.end)
		if (!from || !to) return []
		const label = o.label == null ? undefined : asString(o.label)
		return label ? [{ from, to, label }] : [{ from, to }]
	})
}
