import { buildSystemPrompt } from "./prompt"
import { type RealtimeLoopAction, reduceVoiceUi } from "./realtime-loop"
import { realtimeSession } from "./realtime-session"
import { speech } from "./speech"
import { useApp } from "./store"
import { resolveVoiceApiKey, toRealtimeTools } from "./voice-backend"
import { realtimeConnectFromSettings, voiceUiAfterConnectError, voiceUiAfterUnexpectedClose } from "./voice-contract"

function applyVoiceAction(action: RealtimeLoopAction) {
	const s = useApp.getState()
	s.setPresence(reduceVoiceUi({ presence: s.presence, interim: s.interim, error: s.error }, action))
}

export function voiceRealtimeActive() {
	return realtimeSession.active
}

export async function enterVoiceMode() {
	speech.stopSpeak()
	speech.stopListen()
	realtimeSession.stop()
	const store = useApp.getState()
	store.setVoiceMode(true)
	store.setPresence({ presence: "listening", caption: "", interim: "", error: null })
	await startRealtime()
}

export function exitVoiceMode() {
	realtimeSession.stop()
	speech.stopListen()
	speech.stopSpeak()
	const store = useApp.getState()
	store.setVoiceMode(false)
	store.setPresence({ presence: "idle", interim: "" })
}

export async function restartVoiceIfNeeded() {
	const store = useApp.getState()
	if (!store.voiceMode) return
	realtimeSession.stop()
	speech.stopListen()
	speech.stopSpeak()
	store.setPresence({ presence: "listening", caption: "", interim: "", error: null })
	await startRealtime()
}

async function startRealtime() {
	const store = useApp.getState()
	const { settings } = store
	const tools = toRealtimeTools(store.realtimeTools())
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
		sources: store.sources ?? [],
	})

	realtimeSession.configure({
		onLevel: (level, bands) => useApp.getState().setPresence({ level, bands }),
		onInterim: (role, text) => applyVoiceAction({ type: "interim", role, text }),
		onFinal: (role, text) => {
			if (role === "user") useApp.getState().commitVoiceUser(text)
			applyVoiceAction({ type: "final", role, text })
		},
		onSpeechStart: () => applyVoiceAction({ type: "speech_start" }),
		onSpeechStop: () => applyVoiceAction({ type: "speech_stop" }),
		onResponseStart: () => applyVoiceAction({ type: "response_start" }),
		onResponseDone: (assistantText) => {
			const s = useApp.getState()
			if (assistantText) s.commitVoiceAssistant(assistantText)
			if (s.voiceMode) applyVoiceAction({ type: "response_done", text: assistantText })
		},
		onFunctionCall: async (call) => {
			const result = await useApp.getState().executeVoiceTool(call.name, call.arguments)
			return result.content
		},
		onError: (message) => {
			const s = useApp.getState()
			const next = voiceUiAfterConnectError(message)
			s.setVoiceMode(next.voiceMode)
			s.setPresence({ error: next.error, presence: next.presence })
		},
		onClose: () => {
			const s = useApp.getState()
			const next = voiceUiAfterUnexpectedClose({
				voiceMode: s.voiceMode,
				presence: s.presence,
				error: s.error,
			})
			if (next.voiceMode === s.voiceMode && next.presence === s.presence) return
			s.setVoiceMode(next.voiceMode)
			s.setPresence({ presence: next.presence })
		},
	})

	await realtimeSession.start({
		...realtimeConnectFromSettings(settings),
		apiKey: resolveVoiceApiKey(settings.voiceBackend, settings.provider),
		instructions,
		tools,
	})
}
