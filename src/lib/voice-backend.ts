import type { ChatTool } from "./llm"
import type { RealtimeTool } from "./realtime-protocol"
import type { VoiceBackendId } from "./types"

export {
	applyTranscriptBit,
	audioDeltaFromEvent,
	buildSessionUpdate,
	errorFromEvent,
	type FunctionCallCue,
	functionCallFromEvent,
	REALTIME_SAMPLE_RATE,
	type RealtimeTool,
	realtimeHttpBase,
	realtimeSocketUrl,
	resolveVoiceApiKey,
	type TranscriptCue,
	transcriptFromEvent,
	websocketProtocols,
} from "./realtime-protocol"

export function voiceBackendNeedsKey(id: VoiceBackendId): boolean {
	return id === "xai" || id === "openai"
}

export function toRealtimeTools(tools: ChatTool[]): RealtimeTool[] {
	return tools.map((t) => ({
		type: "function",
		name: t.function.name,
		description: t.function.description,
		parameters: t.function.parameters,
	}))
}
