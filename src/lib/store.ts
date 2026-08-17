import { create } from "zustand";
import {
  isDue,
  makeAutomation,
  matchPhraseAutomations,
  quietReply,
  runLocalAutomation,
  type AutomationDraft,
} from "./automations";
import { emptySnapshot, loadSnapshot, saveSnapshot } from "./persist";
import { notify } from "./host";
import { completeTurn, type ChatMessage, type ChatTool } from "./llm";
import { callMcpTool, handshakeMcp } from "./mcp";
import { applyLocalIntent, buildSystemPrompt } from "./prompt";
import { speech } from "./speech";
import { BUILTIN_TOOLS, executeBuiltin, type World } from "./tools";
import {
  normalizeSettings,
  PROVIDER_PRESETS,
  VOICE_PRESETS,
  usesRealtimeVoice,
  type Artifact,
  type Automation,
  type DialogId,
  type Emotion,
  type McpServer,
  type Memory,
  type MemoryKind,
  type Message,
  type PresenceState,
  type ProviderId,
  type Settings,
  type Snapshot,
  type VoiceBackendId,
} from "./types";
import { nowIso, uid } from "./utils";

type Live = {
  ready: boolean;
  presence: PresenceState;
  emotion: Emotion;
  level: number;
  bands: number[];
  caption: string;
  interim: string;
  voiceMode: boolean;
  composerOpen: boolean;
  dialog: DialogId;
  artifact: Artifact | null;
  error: string | null;
  runningAutomation: string | null;
};

type Actions = {
  hydrate: () => Promise<void>;
  persist: () => void;
  patchSettings: (partial: Partial<Settings>) => void;
  applyProvider: (id: ProviderId) => void;
  setProviderField: (field: Exclude<keyof Settings["provider"], "id">, value: string) => void;
  applyVoiceBackend: (id: VoiceBackendId) => void;
  setVoiceBackendField: (
    field: Exclude<keyof Settings["voiceBackend"], "id">,
    value: string,
  ) => void;
  commitVoiceUser: (text: string) => Message | null;
  commitVoiceAssistant: (text: string) => void;
  executeVoiceTool: (
    name: string,
    args: string,
  ) => Promise<{ content: string; artifact?: Artifact }>;
  realtimeTools: () => ChatTool[];
  setPresence: (
    p: Partial<
      Pick<Live, "presence" | "emotion" | "level" | "bands" | "caption" | "interim" | "error">
    >,
  ) => void;
  openDialog: (d: DialogId) => void;
  openArtifact: (a: Artifact | null) => void;
  setComposerOpen: (open: boolean) => void;
  setVoiceMode: (on: boolean) => void;
  addUserMessage: (text: string) => Message;
  send: (text: string) => Promise<void>;
  addMcp: (server: Omit<McpServer, "tools" | "lastError" | "lastOkAt">) => void;
  removeMcp: (id: string) => void;
  toggleMcp: (id: string) => void;
  testMcp: (id: string) => Promise<void>;
  resolveInbox: (id: string) => void;
  addMemory: (kind: MemoryKind, text: string, pinned?: boolean) => void;
  updateMemory: (id: string, patch: Partial<Pick<Memory, "text" | "kind" | "pinned">>) => void;
  forgetMemory: (id: string) => void;
  addAutomation: (draft: AutomationDraft) => void;
  updateAutomation: (
    id: string,
    patch: Partial<Pick<Automation, "name" | "brief" | "enabled" | "trigger">>,
  ) => void;
  removeAutomation: (id: string) => void;
  runAutomation: (id: string, opts?: { speak?: boolean }) => Promise<void>;
  tickAutomations: () => Promise<void>;
  wipe: () => Promise<void>;
  exportJson: () => string;
  importJson: (raw: string) => void;
};

export type AppStore = Snapshot & Live & Actions;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function takeSnapshot(s: Snapshot): Snapshot {
  return {
    version: 1,
    settings: normalizeSettings(s.settings),
    messages: [...s.messages],
    memories: [...s.memories],
    inbox: [...s.inbox],
    boards: s.boards.map((b) => ({ ...b, items: [...b.items] })),
    timeLogs: [...s.timeLogs],
    insights: [...s.insights],
    mcpServers: [...s.mcpServers],
    automations: [...s.automations],
  };
}

function applyWorld(world: World) {
  return {
    memories: world.snapshot.memories,
    inbox: world.snapshot.inbox,
    boards: world.snapshot.boards,
    timeLogs: world.snapshot.timeLogs,
    insights: world.snapshot.insights,
    mcpServers: world.snapshot.mcpServers,
    automations: world.snapshot.automations,
  };
}

function toolsFor(snap: Snapshot): ChatTool[] {
  const local: ChatTool[] = BUILTIN_TOOLS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));
  const remote: ChatTool[] = snap.mcpServers
    .filter((s) => s.enabled)
    .flatMap((s) =>
      s.tools.map((t) => ({
        type: "function" as const,
        function: {
          name: `mcp__${s.id}__${t.name}`,
          description: `[${s.name}] ${t.description}`,
          parameters: (t.inputSchema as Record<string, unknown>) ?? {
            type: "object",
            properties: {},
          },
        },
      })),
    );
  return [...local, ...remote];
}

function toChat(messages: Message[]): ChatMessage[] {
  return messages
    .filter((m) => !m.hidden && (m.role === "user" || m.role === "assistant" || m.role === "tool"))
    .slice(-20)
    .map((m) => {
      if (m.role === "tool") {
        return {
          role: "tool" as const,
          content: m.content,
          name: m.toolName ?? "tool",
          tool_call_id: m.id,
        };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    });
}

async function runToolsLoop(
  world: World,
  chat: ChatMessage[],
): Promise<{ spoken: string; error?: string }> {
  const tools = toolsFor(world.snapshot);
  for (let hop = 0; hop < 4; hop++) {
    const res = await completeTurn({
      provider: world.snapshot.settings.provider,
      messages: chat,
      tools,
    });
    if (!res.ok) return { spoken: "", error: res.error };
    if (res.toolCalls.length) {
      chat.push({
        role: "assistant",
        content: res.content ?? "",
        tool_calls: res.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.arguments },
        })),
      });
      for (const call of res.toolCalls) {
        const result = await runTool(call.name, call.arguments, world);
        chat.push({
          role: "tool",
          content: result.content,
          name: call.name,
          tool_call_id: call.id,
        });
        if (result.artifact) world.opened = result.artifact;
      }
      continue;
    }
    return { spoken: (res.content ?? "").trim() };
  }
  return { spoken: "" };
}

export const useApp = create<AppStore>((set, get) => ({
  ...emptySnapshot(),
  ready: false,
  presence: "idle",
  emotion: "calm",
  level: 0,
  bands: Array.from({ length: 24 }, () => 0.12),
  caption: "",
  interim: "",
  voiceMode: false,
  composerOpen: false,
  dialog: null,
  artifact: null,
  error: null,
  runningAutomation: null,

  hydrate: async () => {
    const snap = await loadSnapshot();
    set((s) => {
      if (s.messages.length > 0 || s.presence === "thinking" || s.presence === "speaking") {
        return { ready: true };
      }
      return { ...snap, ready: true };
    });
  },

  persist: () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void saveSnapshot(takeSnapshot(get())).catch((err) => {
        console.error("[moya] persist failed", err);
      });
    }, 180);
  },

  patchSettings: (partial) => {
    set((s) => ({ settings: { ...s.settings, ...partial } }));
    get().persist();
  },

  applyProvider: (id) => {
    const next = PROVIDER_PRESETS[id];
    set((s) => ({
      settings: {
        ...s.settings,
        provider: {
          id,
          model: next.model,
          baseUrl: next.baseUrl,
          apiKey: "",
        },
      },
    }));
    get().persist();
  },

  setProviderField: (field, value) => {
    set((s) => ({
      settings: { ...s.settings, provider: { ...s.settings.provider, [field]: value } },
    }));
    get().persist();
  },

  applyVoiceBackend: (id) => {
    const next = VOICE_PRESETS[id];
    set((s) => ({
      settings: {
        ...s.settings,
        voiceBackend: {
          id,
          model: next.model,
          baseUrl: next.baseUrl,
          apiKey: "",
          voice: next.voice,
        },
      },
    }));
    get().persist();
  },

  setVoiceBackendField: (field, value) => {
    set((s) => ({
      settings: {
        ...s.settings,
        voiceBackend: { ...s.settings.voiceBackend, [field]: value },
      },
    }));
    get().persist();
  },

  realtimeTools: () => toolsFor(takeSnapshot(get())),

  commitVoiceUser: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const last = [...get().messages].reverse().find((m) => !m.hidden);
    if (last?.role === "user" && last.content === trimmed) return last;
    return get().addUserMessage(trimmed);
  },

  commitVoiceAssistant: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const last = [...get().messages].reverse().find((m) => !m.hidden);
    if (last?.role === "assistant" && last.content === trimmed) {
      set({ caption: trimmed });
      return;
    }
    const em = /sorry|cannot|can't|blocked|urgent/i.test(trimmed)
      ? "concerned"
      : /good|glad|nice|yes/i.test(trimmed)
        ? "warm"
        : "calm";
    const reply: Message = {
      id: uid("a"),
      role: "assistant",
      content: trimmed,
      createdAt: nowIso(),
      emotion: em,
    };
    set({ messages: [...get().messages, reply], emotion: em, caption: trimmed });
    get().persist();
  },

  executeVoiceTool: async (name, args) => {
    const world: World = { snapshot: takeSnapshot(get()) };
    const result = await runTool(name, args, world);
    set(applyWorld(world));
    if (world.opened) get().openArtifact(world.opened);
    get().persist();
    return result;
  },

  setPresence: (p) => set(p),

  openDialog: (d) => set({ dialog: d }),
  openArtifact: (a) =>
    set({
      artifact: a,
      dialog: a ? "artifact" : get().dialog === "artifact" ? null : get().dialog,
    }),
  setComposerOpen: (open) => set({ composerOpen: open }),
  setVoiceMode: (on) => set({ voiceMode: on, composerOpen: on ? false : get().composerOpen }),

  addUserMessage: (text) => {
    const msg: Message = { id: uid("u"), role: "user", content: text, createdAt: nowIso() };
    set((s) => ({ messages: [...s.messages, msg] }));
    get().persist();
    return msg;
  },

  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const store = get();
    if (store.presence === "thinking") return;
    store.addUserMessage(trimmed);
    set({ presence: "thinking", caption: "", interim: "", error: null, emotion: "focused" });

    const world: World = { snapshot: takeSnapshot(get()) };
    const triggered = matchPhraseAutomations(world.snapshot.automations, trimmed);
    if (triggered.length) {
      const now = nowIso();
      world.snapshot.automations = world.snapshot.automations.map((a) =>
        triggered.some((t) => t.id === a.id)
          ? { ...a, lastRunAt: now, lastResult: "Triggered by phrase." }
          : a,
      );
    }
    const extra = triggered.length
      ? `Triggered routines:\n${triggered.map((a) => `- ${a.name}: ${a.brief}`).join("\n")}`
      : "";

    const chat: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(world.snapshot, extra) },
      ...toChat(world.snapshot.messages),
    ];

    let spoken = "";
    try {
      const res = await runToolsLoop(world, chat);
      if (res.error) {
        const local = applyLocalIntent(trimmed, world);
        spoken = local.spoken;
        if (!/not available|Add a key|Add an API key/i.test(res.error)) set({ error: res.error });
      } else {
        spoken = res.spoken;
      }
    } catch (err) {
      spoken = applyLocalIntent(trimmed, world).spoken;
      set({ error: err instanceof Error ? err.message : "Something went wrong." });
    }

    if (!spoken) spoken = "Done.";
    const em = /sorry|cannot|can't|blocked|urgent/i.test(spoken)
      ? "concerned"
      : /good|glad|nice|yes/i.test(spoken)
        ? "warm"
        : "calm";
    const reply: Message = {
      id: uid("a"),
      role: "assistant",
      content: spoken,
      createdAt: nowIso(),
      emotion: em,
      artifacts: world.opened ? [world.opened] : undefined,
    };

    const speakBrowser = get().settings.autoSpeak && !skipBrowserSpeak(get());
    set({
      messages: [...get().messages, reply],
      ...applyWorld(world),
      emotion: em,
      caption: spoken,
      presence: speakBrowser ? "speaking" : get().voiceMode ? "listening" : "idle",
    });
    if (world.opened) get().openArtifact(world.opened);
    get().persist();
    const added = world.snapshot.inbox.filter(
      (i) => !i.resolvedAt && !store.inbox.some((x) => x.id === i.id),
    );
    if (added[0]) void notify(added[0].title, added[0].body);

    if (speakBrowser) {
      speech.speak(spoken, {
        voiceURI: get().settings.voiceURI,
        rate: get().settings.rate,
        pitch: get().settings.pitch,
      });
    }
  },

  addMcp: (server) => {
    set((s) => ({ mcpServers: [...s.mcpServers, { ...server, tools: [] }] }));
    get().persist();
  },
  removeMcp: (id) => {
    set((s) => ({ mcpServers: s.mcpServers.filter((m) => m.id !== id) }));
    get().persist();
  },
  toggleMcp: (id) => {
    set((s) => ({
      mcpServers: s.mcpServers.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)),
    }));
    get().persist();
  },
  testMcp: async (id) => {
    const server = get().mcpServers.find((m) => m.id === id);
    if (!server) return;
    const { server: next, error } = await handshakeMcp(server);
    set((s) => ({ mcpServers: s.mcpServers.map((m) => (m.id === id ? next : m)) }));
    get().persist();
    if (error) set({ error });
  },

  resolveInbox: (id) => {
    set((s) => ({
      inbox: s.inbox.map((i) => (i.id === id ? { ...i, resolvedAt: nowIso() } : i)),
    }));
    get().persist();
  },

  addMemory: (kind, text, pinned = false) => {
    const t = text.trim();
    if (!t) return;
    const world: World = { snapshot: takeSnapshot(get()) };
    executeBuiltin("memory_write", JSON.stringify({ kind, text: t, pinned }), world);
    set(applyWorld(world));
    get().persist();
  },

  updateMemory: (id, patch) => {
    set((s) => ({
      memories: s.memories.map((m) => (m.id === id ? { ...m, ...patch, lastUsedAt: nowIso() } : m)),
    }));
    get().persist();
  },

  forgetMemory: (id) => {
    set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }));
    get().persist();
  },

  addAutomation: (draft) => {
    const auto = makeAutomation(draft);
    set((s) => ({ automations: [auto, ...s.automations] }));
    get().persist();
  },

  updateAutomation: (id, patch) => {
    set((s) => ({
      automations: s.automations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
    get().persist();
  },

  removeAutomation: (id) => {
    set((s) => ({ automations: s.automations.filter((a) => a.id !== id) }));
    get().persist();
  },

  runAutomation: async (id, opts) => {
    const auto = get().automations.find((a) => a.id === id);
    if (!auto || get().runningAutomation) return;
    const speak = opts?.speak ?? false;
    const beforeInbox = get().inbox;
    set({
      runningAutomation: id,
      presence: get().presence === "idle" ? "thinking" : get().presence,
      emotion: "focused",
    });

    const world: World = { snapshot: takeSnapshot(get()) };
    const extra = `You are executing a routine named "${auto.name}". ${auto.brief}\nUse tools. If the human does not need to hear you, reply with OK.`;
    const chat: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(world.snapshot, extra) },
      { role: "user", content: `Run routine: ${auto.name}` },
    ];

    let spoken = "";
    try {
      const res = await runToolsLoop(world, chat);
      spoken = res.spoken || runLocalAutomation(auto, world);
      if (res.error) spoken = runLocalAutomation(auto, world);
    } catch {
      spoken = runLocalAutomation(auto, world);
    }

    const result = spoken || "Done.";
    world.snapshot.automations = world.snapshot.automations.map((a) =>
      a.id === id ? { ...a, lastRunAt: nowIso(), lastResult: result } : a,
    );

    const keep = !quietReply(result);
    const reply: Message | null = keep
      ? {
          id: uid("a"),
          role: "assistant",
          content: result,
          createdAt: nowIso(),
          emotion: "calm",
          artifacts: world.opened ? [world.opened] : undefined,
        }
      : null;

    set({
      ...applyWorld(world),
      messages: reply ? [...get().messages, reply] : get().messages,
      runningAutomation: null,
      presence:
        speak && keep && get().settings.autoSpeak
          ? "speaking"
          : get().voiceMode
            ? "listening"
            : "idle",
      caption: keep ? result : get().caption,
    });
    if (world.opened) get().openArtifact(world.opened);
    get().persist();
    const addedAuto = world.snapshot.inbox.filter(
      (i) => !i.resolvedAt && !beforeInbox.some((x) => x.id === i.id),
    );
    if (addedAuto[0]) void notify(addedAuto[0].title, addedAuto[0].body);

    if (speak && keep && get().settings.autoSpeak && !skipBrowserSpeak(get())) {
      speech.speak(result, {
        voiceURI: get().settings.voiceURI,
        rate: get().settings.rate,
        pitch: get().settings.pitch,
      });
    }
  },

  tickAutomations: async () => {
    const s = get();
    if (!s.ready || s.presence === "thinking" || s.runningAutomation) return;
    const due = s.automations.find((a) => isDue(a));
    if (!due) return;
    const busy = s.presence === "listening" || s.presence === "speaking" || s.voiceMode;
    await get().runAutomation(due.id, { speak: !busy });
  },

  wipe: async () => {
    const empty = emptySnapshot();
    set({
      ...empty,
      ready: true,
      artifact: null,
      caption: "",
      interim: "",
      error: null,
      presence: "idle",
      runningAutomation: null,
    });
    get().persist();
  },

  exportJson: () => JSON.stringify(takeSnapshot(get()), null, 2),

  importJson: (raw) => {
    try {
      const parsed = JSON.parse(raw) as Snapshot;
      if (parsed.version !== 1) {
        set({ error: "Unknown snapshot version." });
        return;
      }
      set({
        settings: normalizeSettings(parsed.settings),
        messages: parsed.messages ?? [],
        memories: parsed.memories ?? [],
        inbox: parsed.inbox ?? [],
        boards: parsed.boards ?? [],
        timeLogs: parsed.timeLogs ?? [],
        insights: parsed.insights ?? [],
        mcpServers: parsed.mcpServers ?? [],
        automations: parsed.automations ?? [],
        error: null,
      });
      get().persist();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Could not import that file.",
      });
    }
  },
}));

async function runTool(
  name: string,
  args: string,
  world: World,
): Promise<{ content: string; artifact?: Artifact }> {
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    const serverId = parts[1];
    const toolName = parts.slice(2).join("__");
    const server = world.snapshot.mcpServers.find((s) => s.id === serverId);
    if (!server) return { content: `MCP server ${serverId} is gone.` };
    let parsed: unknown = {};
    try {
      parsed = args ? JSON.parse(args) : {};
    } catch {
      parsed = {};
    }
    const content = await callMcpTool(server, toolName, parsed);
    return { content };
  }
  const result = executeBuiltin(name, args, world);
  return { content: result.content, artifact: result.artifact };
}

function skipBrowserSpeak(s: { voiceMode: boolean; settings: Settings }) {
  return s.voiceMode && usesRealtimeVoice(s.settings.voiceBackend.id);
}

export function pendingInboxCount(inbox: { resolvedAt: string | null }[]) {
  return inbox.filter((i) => !i.resolvedAt).length;
}

export function pendingRoutineCount(autos: Automation[]) {
  return autos.filter((a) => a.enabled).length;
}
