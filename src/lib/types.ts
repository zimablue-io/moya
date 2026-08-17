export type Emotion = "calm" | "focused" | "alert" | "warm" | "concerned";
export type PresenceState = "idle" | "listening" | "thinking" | "speaking";
export type Role = "user" | "assistant" | "system" | "tool";
export type InboxSeverity = "info" | "need" | "urgent";
export type BoardItemState = "watching" | "running" | "blocked" | "idle" | "done";
export type MemoryKind = "fact" | "preference" | "decision" | "project" | "insight";

export type ProviderId =
  "xai" | "openai" | "groq" | "openrouter" | "ollama" | "llamacpp" | "custom";

export type DialogId = "history" | "watch" | "settings" | "artifact" | "memory" | "routines" | null;

export interface ProviderConfig {
  id: ProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
}

export interface Settings {
  agentName: string;
  userName: string;
  brief: string;
  autoSpeak: boolean;
  voiceURI: string;
  rate: number;
  pitch: number;
  showCaptions: boolean;
  provider: ProviderConfig;
}

export interface ArtifactNode {
  id: string;
  label: string;
}

export interface ArtifactEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ArtifactStatusItem {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "alert" | "neutral";
}

export interface ArtifactChartPoint {
  x: string;
  y: number;
}

export type Artifact =
  | { type: "status"; title: string; items: ArtifactStatusItem[] }
  | {
      type: "chart";
      title: string;
      series: { name: string; points: ArtifactChartPoint[] }[];
    }
  | { type: "diagram"; title: string; nodes: ArtifactNode[]; edges: ArtifactEdge[] }
  | { type: "brief"; title: string; body: string; actions?: { id: string; label: string }[] }
  | { type: "note"; title: string; body: string };

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  emotion?: Emotion;
  artifacts?: Artifact[];
  toolName?: string;
  hidden?: boolean;
}

export interface Memory {
  id: string;
  kind: MemoryKind;
  text: string;
  weight: number;
  pinned: boolean;
  createdAt: string;
  lastUsedAt: string;
}

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  source: string;
  severity: InboxSeverity;
  createdAt: string;
  resolvedAt: string | null;
}

export interface BoardItem {
  id: string;
  label: string;
  state: BoardItemState;
  note: string;
  needsInput: boolean;
}

export interface Board {
  id: string;
  name: string;
  summary: string;
  items: BoardItem[];
  updatedAt: string;
}

export interface TimeLog {
  id: string;
  startedAt: string;
  endedAt: string;
  category: string;
  note: string;
}

export interface Insight {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export type AutomationTrigger =
  | { type: "manual" }
  | { type: "interval"; everyMinutes: number }
  | { type: "daily"; hour: number; minute: number }
  | { type: "phrase"; pattern: string };

export interface Automation {
  id: string;
  name: string;
  brief: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  lastRunAt: string | null;
  lastResult: string;
  createdAt: string;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  authHeader: string;
  enabled: boolean;
  sessionId?: string;
  tools: McpTool[];
  lastError?: string;
  lastOkAt?: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  serverId: string;
}

export interface Snapshot {
  version: 1;
  settings: Settings;
  messages: Message[];
  memories: Memory[];
  inbox: InboxItem[];
  boards: Board[];
  timeLogs: TimeLog[];
  insights: Insight[];
  mcpServers: McpServer[];
  automations: Automation[];
}

export const DEFAULT_SETTINGS: Settings = {
  agentName: "Moya",
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
};

export const PROVIDER_PRESETS: Record<
  ProviderId,
  { label: string; model: string; baseUrl: string; hint: string }
> = {
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
    hint: "You run Ollama. Moya does not start it.",
  },
  llamacpp: {
    label: "llama.cpp (local)",
    model: "",
    baseUrl: "http://127.0.0.1:8080/v1",
    hint: "You run llama-server. Moya does not start it. URL must end in /v1.",
  },
  custom: {
    label: "Custom OpenAI-compatible",
    model: "",
    baseUrl: "http://127.0.0.1:1234/v1",
    hint: "Any OpenAI-compatible endpoint.",
  },
};

export const MEMORY_KINDS: { id: MemoryKind; label: string }[] = [
  { id: "fact", label: "Fact" },
  { id: "preference", label: "Preference" },
  { id: "decision", label: "Decision" },
  { id: "project", label: "Project" },
  { id: "insight", label: "Insight" },
];

const PROVIDER_IDS = new Set<string>(Object.keys(PROVIDER_PRESETS));

export function llamaCppBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}/v1`;
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDER_IDS.has(value);
}

export function normalizeSettings(raw: unknown): Settings {
  const s = (raw ?? {}) as Partial<Settings> & { engine?: { port?: number } };
  const rawEngine = s.engine ?? {};
  const rawProvider = (s.provider ?? {}) as Partial<ProviderConfig>;
  const rawId = rawProvider.id ?? "";
  const id = isProviderId(rawId) ? rawId : DEFAULT_SETTINGS.provider.id;
  const preset = PROVIDER_PRESETS[id];
  const storedUrl = rawProvider.baseUrl?.trim() ?? "";
  const legacyPort = Number(rawEngine.port) || 0;
  const provider: ProviderConfig = {
    id,
    model: rawProvider.model?.trim() || (id === "llamacpp" ? "" : preset.model),
    baseUrl:
      storedUrl || (id === "llamacpp" && legacyPort ? llamaCppBaseUrl(legacyPort) : preset.baseUrl),
    apiKey: rawProvider.apiKey ?? DEFAULT_SETTINGS.provider.apiKey,
  };

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
  };
}
