import { APP_NAME } from "./brand.ts"

export type Emotion = "calm" | "focused" | "alert" | "warm" | "concerned"
export type PresenceState = "idle" | "listening" | "thinking" | "speaking"
export type Role = "user" | "assistant" | "system" | "tool"
export type InboxSeverity = "info" | "need" | "urgent"
export type BoardItemState = "watching" | "running" | "blocked" | "idle" | "done"
export type MemoryKind = "fact" | "preference" | "decision" | "project" | "insight"

export type ProviderId = "xai" | "openai" | "groq" | "openrouter" | "ollama" | "llamacpp" | "custom"

export type VoiceBackendId = "s2s" | "xai" | "openai" | "custom" | "browser"

export type DialogId = "history" | "watch" | "settings" | "artifact" | "memory" | "routines" | null

export type SourceKind = "brought" | "calendar" | "work"
export type SourceMode = "read"

export interface CalendarEvent {
	id: string
	title: string
	start: string
	end: string
}

export interface WorkItem {
	id: string
	title: string
	state: string
	url?: string
}

export interface BroughtFile {
	name: string
	text: string
}

export interface Source {
	id: string
	kind: SourceKind
	name: string
	mode: SourceMode
	origin: string
	authHeader: string
	files: BroughtFile[]
	events: CalendarEvent[]
	work: WorkItem[]
	lastSyncAt: string | null
	createdAt: string
}

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

export type ArtifactGrounding = "sketch"

export type Artifact =
	| { type: "status"; title: string; items: ArtifactStatusItem[]; grounding?: ArtifactGrounding }
	| {
			type: "chart"
			title: string
			series: { name: string; points: ArtifactChartPoint[] }[]
			grounding?: ArtifactGrounding
	  }
	| { type: "diagram"; title: string; nodes: ArtifactNode[]; edges: ArtifactEdge[]; grounding?: ArtifactGrounding }
	| {
			type: "brief"
			title: string
			body: string
			actions?: { id: string; label: string }[]
			grounding?: ArtifactGrounding
	  }
	| { type: "note"; title: string; body: string; grounding?: ArtifactGrounding }
	| {
			type: "mockup"
			title: string
			frames: { title: string; blocks: { type: string; label: string }[] }[]
			grounding?: ArtifactGrounding
	  }

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
	sources: Source[]
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
		id: "s2s",
		model: "local",
		baseUrl: "http://127.0.0.1:8765/v1",
		apiKey: "",
		voice: "af_heart",
	},
}

export const MEMORY_KINDS: { id: MemoryKind; label: string }[] = [
	{ id: "fact", label: "Fact" },
	{ id: "preference", label: "Preference" },
	{ id: "decision", label: "Decision" },
	{ id: "project", label: "Project" },
	{ id: "insight", label: "Insight" },
]

export { normalizeArtifact, normalizeArtifacts, normalizeSettings, normalizeSnapshot } from "./types-normalize.ts"
export {
	isKokoroVoice,
	isProviderId,
	isVoiceBackendId,
	KOKORO_TTS_VOICES,
	llamaCppBaseUrl,
	localConversationVoice,
	POCKET_TTS_VOICES,
	PROVIDER_PRESETS,
	REALTIME_VOICES,
	speakersFor,
	VOICE_CHOICES,
	VOICE_PRESETS,
	voiceUrlIsEditable,
	voiceUsesRealtime,
} from "./types-presets.ts"
