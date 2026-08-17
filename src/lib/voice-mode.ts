import { buildSystemPrompt } from "./prompt";
import { realtimeSession } from "./realtime-session";
import { speech } from "./speech";
import { useApp } from "./store";
import { usesRealtimeVoice } from "./types";
import { toRealtimeTools, resolveVoiceApiKey } from "./voice-backend";

export function voiceRealtimeActive() {
  return realtimeSession.active;
}

export async function enterVoiceMode() {
  speech.stopSpeak();
  speech.stopListen();
  realtimeSession.stop();
  const store = useApp.getState();
  store.setVoiceMode(true);
  store.setPresence({ presence: "listening", caption: "", interim: "", error: null });

  if (!usesRealtimeVoice(store.settings.voiceBackend.id)) {
    void speech.startListen({ continuous: true });
    return;
  }
  await startRealtime();
}

export function exitVoiceMode() {
  realtimeSession.stop();
  speech.stopListen();
  speech.stopSpeak();
  const store = useApp.getState();
  store.setVoiceMode(false);
  store.setPresence({ presence: "idle", interim: "" });
}

export async function restartVoiceIfNeeded() {
  const store = useApp.getState();
  if (!store.voiceMode) return;
  realtimeSession.stop();
  speech.stopListen();
  speech.stopSpeak();
  if (!usesRealtimeVoice(store.settings.voiceBackend.id)) {
    store.setPresence({ presence: "listening", caption: "", interim: "", error: null });
    void speech.startListen({ continuous: true });
    return;
  }
  await startRealtime();
}

async function startRealtime() {
  const store = useApp.getState();
  const { settings } = store;
  const tools = toRealtimeTools(store.realtimeTools());
  const instructions = buildSystemPrompt({
    version: 1,
    settings,
    messages: store.messages,
    memories: store.memories,
    inbox: store.inbox,
    boards: store.boards,
    timeLogs: store.timeLogs,
    insights: store.insights,
    mcpServers: store.mcpServers,
    automations: store.automations,
  });

  realtimeSession.configure({
    onLevel: (level, bands) => useApp.getState().setPresence({ level, bands }),
    onInterim: (role, text) => {
      const s = useApp.getState();
      if (role === "user") s.setPresence({ interim: text, presence: "listening" });
      else s.setPresence({ caption: text, presence: "speaking" });
    },
    onFinal: (role, text) => {
      const s = useApp.getState();
      if (role === "user") {
        s.commitVoiceUser(text);
        s.setPresence({ interim: "", presence: "thinking" });
      } else {
        s.setPresence({ caption: text, presence: "speaking" });
      }
    },
    onSpeechStart: () => {
      useApp.getState().setPresence({ presence: "listening", interim: "", error: null });
    },
    onSpeechStop: () => {
      useApp.getState().setPresence({ presence: "thinking", interim: "" });
    },
    onResponseStart: () => {
      useApp.getState().setPresence({ presence: "speaking" });
    },
    onResponseDone: (assistantText) => {
      const s = useApp.getState();
      if (assistantText) s.commitVoiceAssistant(assistantText);
      if (s.voiceMode) s.setPresence({ presence: "listening", interim: "" });
    },
    onFunctionCall: async (call) => {
      const result = await useApp.getState().executeVoiceTool(call.name, call.arguments);
      return result.content;
    },
    onError: (message) => {
      const s = useApp.getState();
      s.setPresence({ error: message, presence: s.voiceMode ? "listening" : "idle" });
    },
    onClose: () => {
      const s = useApp.getState();
      if (!s.voiceMode) return;
      if (s.presence === "listening" || s.presence === "thinking" || s.presence === "speaking") {
        s.setPresence({ presence: "idle" });
      }
    },
  });

  await realtimeSession.start({
    id: settings.voiceBackend.id,
    baseUrl: settings.voiceBackend.baseUrl,
    model: settings.voiceBackend.model,
    apiKey: resolveVoiceApiKey(settings.voiceBackend, settings.provider),
    voice: settings.voiceBackend.voice,
    instructions,
    tools,
  });
}
