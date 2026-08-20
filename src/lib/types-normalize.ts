import {
	type Artifact,
	type Automation,
	type Board,
	type BoardItemState,
	DEFAULT_SETTINGS,
	type InboxItem,
	type Insight,
	type McpServer,
	type Memory,
	type Message,
	type ProviderConfig,
	type Settings,
	type Snapshot,
	type Source,
	type TimeLog,
	type VoiceConfig,
	type WorkItem,
} from "./types.ts"
import {
	asArray,
	asRecord,
	asString,
	parseChartSeries,
	parseEdges,
	parseNodes,
	parseStatusItems,
} from "./types-parse.ts"
import {
	isProviderId,
	isVoiceBackendId,
	llamaCppBaseUrl,
	localConversationVoice,
	PROVIDER_PRESETS,
	VOICE_PRESETS,
} from "./types-presets.ts"

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
		model: rawProvider.model?.trim() || (id === "llamacpp" || id === "ondevice" ? "" : preset.model),
		baseUrl:
			id === "ondevice"
				? ""
				: storedUrl || (id === "llamacpp" && legacyPort ? llamaCppBaseUrl(legacyPort) : preset.baseUrl),
		apiKey: rawProvider.apiKey ?? DEFAULT_SETTINGS.provider.apiKey,
	}

	const rawVoice = (s.voiceBackend ?? {}) as Partial<VoiceConfig>
	const storedId = String(rawVoice.id ?? "")
	const rawVoiceId = storedId === "custom" ? "s2s" : storedId
	const voiceId = isVoiceBackendId(rawVoiceId) ? rawVoiceId : DEFAULT_SETTINGS.voiceBackend.id
	const voicePreset = VOICE_PRESETS[voiceId]
	const keepStoredUrl = storedId === "s2s" || storedId === "custom" || storedId === "xai" || storedId === "openai"
	const storedVoice = rawVoice.voice?.trim() || voicePreset.voice
	const voiceBackend: VoiceConfig = {
		id: voiceId,
		model: rawVoice.model?.trim() || voicePreset.model,
		baseUrl: (keepStoredUrl && rawVoice.baseUrl?.trim()) || voicePreset.baseUrl,
		apiKey: rawVoice.apiKey ?? DEFAULT_SETTINGS.voiceBackend.apiKey,
		voice: voiceId === "s2s" ? localConversationVoice(storedVoice) : storedVoice,
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
		return { type: "status", title, items: parseStatusItems(a.items), grounding: "sketch" }
	}
	if (type === "chart") {
		return { type: "chart", title, series: parseChartSeries(a.series), grounding: "sketch" }
	}
	if (type === "diagram") {
		const nested = asRecord(a.graph) ?? asRecord(a.data) ?? {}
		const nodes = parseNodes(a.nodes ?? nested.nodes ?? a.elements)
		const edges = parseEdges(a.edges ?? a.connections ?? a.links ?? nested.edges ?? nested.connections ?? nested.links)
		return { type: "diagram", title, nodes, edges, grounding: "sketch" }
	}
	if (type === "brief" || type === "note") {
		return { type, title, body: asString(a.body), grounding: "sketch" }
	}
	if (type === "mockup") {
		const frames = asArray(a.frames).flatMap((frame) => {
			const o = asRecord(frame)
			if (!o) return []
			const blocks = asArray(o.blocks).flatMap((block) => {
				const b = asRecord(block)
				if (!b) return []
				return [{ type: asString(b.type, "box"), label: asString(b.label, "Block") }]
			})
			return [{ title: asString(o.title, "Frame"), blocks }]
		})
		return { type: "mockup", title, frames, grounding: "sketch" }
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
		sources: asArray(s.sources)
			.map(normalizeSource)
			.filter((src): src is Source => src != null),
	}
}

function normalizeSource(raw: unknown): Source | null {
	const s = asRecord(raw)
	if (!s) return null
	const kind = String(s.kind ?? "")
	if (kind !== "brought" && kind !== "calendar" && kind !== "work") return null
	return {
		id: asString(s.id) || asString(s.name, "src"),
		kind,
		name: asString(s.name, "Source"),
		mode: "read",
		origin: asString(s.origin),
		authHeader: asString(s.authHeader),
		files: asArray(s.files).flatMap((f) => {
			const o = asRecord(f)
			if (!o) return []
			return [{ name: asString(o.name, "file"), text: asString(o.text) }]
		}),
		events: asArray(s.events).flatMap((e) => {
			const o = asRecord(e)
			if (!o) return []
			return [{ id: asString(o.id, "ev"), title: asString(o.title), start: asString(o.start), end: asString(o.end) }]
		}),
		work: asArray(s.work).flatMap((w) => {
			const o = asRecord(w)
			if (!o) return []
			const item: WorkItem = { id: asString(o.id, "w"), title: asString(o.title), state: asString(o.state, "open") }
			if (o.url) item.url = asString(o.url)
			return [item]
		}),
		lastSyncAt: s.lastSyncAt ? asString(s.lastSyncAt) : null,
		createdAt: asString(s.createdAt),
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
