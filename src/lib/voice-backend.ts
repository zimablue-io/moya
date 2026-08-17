import type { ChatTool } from "./llm";
import type { VoiceBackendId } from "./types";
import type { RealtimeTool } from "./realtime-protocol";

export {
  REALTIME_SAMPLE_RATE,
  applyTranscriptBit,
  audioDeltaFromEvent,
  buildSessionUpdate,
  errorFromEvent,
  functionCallFromEvent,
  realtimeHttpBase,
  realtimeSocketUrl,
  resolveVoiceApiKey,
  transcriptFromEvent,
  websocketProtocols,
  type FunctionCallCue,
  type RealtimeTool,
  type TranscriptCue,
} from "./realtime-protocol";

export function voiceBackendNeedsKey(id: VoiceBackendId): boolean {
  return id === "xai" || id === "openai";
}

export function toRealtimeTools(tools: ChatTool[]): RealtimeTool[] {
  return tools.map((t) => ({
    type: "function",
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));
}
