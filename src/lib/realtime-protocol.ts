export const REALTIME_SAMPLE_RATE = 24_000;

export type RealtimeTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type TranscriptCue = {
  role: "user" | "assistant";
  text: string;
  mode: "delta" | "replace" | "final";
};

export type FunctionCallCue = {
  callId: string;
  name: string;
  arguments: string;
};

export function realtimeSocketUrl(baseUrl: string, model: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("No voice endpoint configured.");
  const ws = trimmed.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  const path = /\/realtime$/i.test(ws) ? ws : `${ws}/realtime`;
  const url = new URL(path);
  const id = model.trim();
  if (id && !url.searchParams.has("model")) url.searchParams.set("model", id);
  return url.toString();
}

export function realtimeHttpBase(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/realtime$/i, "");
}

export function resolveVoiceApiKey(
  voice: { id: string; apiKey: string },
  provider: { id: string; apiKey: string },
): string {
  const own = voice.apiKey.trim();
  if (own) return own;
  if (voice.id === provider.id && (voice.id === "xai" || voice.id === "openai")) {
    return provider.apiKey.trim();
  }
  return "";
}

export function buildSessionUpdate(opts: {
  instructions: string;
  voice: string;
  tools: RealtimeTool[];
  sampleRate?: number;
}): Record<string, unknown> {
  const rate = opts.sampleRate ?? REALTIME_SAMPLE_RATE;
  const vad = {
    type: "server_vad",
    silence_duration_ms: 400,
    interrupt_response: true,
  };
  return {
    type: "session.update",
    session: {
      type: "realtime",
      instructions: opts.instructions,
      ...(opts.voice ? { voice: opts.voice } : {}),
      turn_detection: { type: "server_vad", silence_duration_ms: 400 },
      audio: {
        input: {
          format: { type: "audio/pcm", rate },
          turn_detection: vad,
        },
        output: {
          format: { type: "audio/pcm", rate },
          ...(opts.voice ? { voice: opts.voice } : {}),
        },
      },
      tools: opts.tools,
    },
  };
}

export function audioDeltaFromEvent(event: Record<string, unknown>): string | null {
  const type = String(event.type ?? "");
  if (type !== "response.output_audio.delta" && type !== "response.audio.delta") return null;
  if (typeof event.delta === "string" && event.delta) return event.delta;
  if (typeof event.audio === "string" && event.audio) return event.audio;
  return null;
}

export function transcriptFromEvent(event: Record<string, unknown>): TranscriptCue | null {
  const type = String(event.type ?? "");
  const text = pickTranscript(event);
  if (type === "conversation.item.input_audio_transcription.delta") {
    return text ? { role: "user", text, mode: "delta" } : null;
  }
  if (type === "conversation.item.input_audio_transcription.updated") {
    return { role: "user", text, mode: "replace" };
  }
  if (type === "conversation.item.input_audio_transcription.completed") {
    return { role: "user", text, mode: "final" };
  }
  if (
    type === "response.output_audio_transcript.delta" ||
    type === "response.audio_transcript.delta"
  ) {
    return text ? { role: "assistant", text, mode: "delta" } : null;
  }
  if (
    type === "response.output_audio_transcript.done" ||
    type === "response.audio_transcript.done"
  ) {
    return { role: "assistant", text, mode: "final" };
  }
  return null;
}

export function functionCallFromEvent(event: Record<string, unknown>): FunctionCallCue | null {
  if (String(event.type ?? "") !== "response.function_call_arguments.done") return null;
  const callId = String(event.call_id ?? event.callId ?? "");
  const name = String(event.name ?? "");
  const args =
    typeof event.arguments === "string" ? event.arguments : JSON.stringify(event.arguments ?? {});
  if (!callId || !name) return null;
  return { callId, name, arguments: args };
}

export function errorFromEvent(event: Record<string, unknown>): string | null {
  if (String(event.type ?? "") !== "error") return null;
  const nested = event.error;
  if (nested && typeof nested === "object") {
    const rec = nested as Record<string, unknown>;
    if (typeof rec.message === "string" && rec.message.trim()) return rec.message.trim();
  }
  if (typeof event.message === "string" && event.message.trim()) return event.message.trim();
  return "Voice backend error.";
}

export function websocketProtocols(id: string, secret: string): string[] | undefined {
  if (!secret) return undefined;
  if (id === "xai") return [`xai-client-secret.${secret}`];
  if (id === "openai") {
    return ["realtime", `openai-insecure-api-key.${secret}`, "openai-beta.realtime=v1"];
  }
  return undefined;
}

function pickTranscript(event: Record<string, unknown>): string {
  if (typeof event.delta === "string") return event.delta;
  if (typeof event.transcript === "string") return event.transcript;
  if (typeof event.text === "string") return event.text;
  const item = event.item;
  if (item && typeof item === "object") {
    const rec = item as Record<string, unknown>;
    if (typeof rec.transcript === "string") return rec.transcript;
  }
  return "";
}
