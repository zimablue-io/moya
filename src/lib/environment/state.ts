import { emptySnapshot } from "../persist.ts"
import type { Snapshot } from "../types.ts"
import type { EnvState, UiState } from "./types.ts"

export function emptyUiState(): UiState {
	return {
		dialog: null,
		artifact: null,
		composerOpen: false,
		voiceMode: false,
		menuOpen: false,
		settingsTab: "general",
		watchTab: "inbox",
		historyMode: "list",
		historyQuery: "",
		historyDay: null,
		memoryQuery: "",
		memoryKind: "all",
		routinesFormOpen: false,
		focusField: null,
	}
}

export function emptyEnv(): EnvState {
	return { snapshot: emptySnapshot(), ui: emptyUiState() }
}

export function cloneSnapshot(s: Snapshot): Snapshot {
	return {
		version: 1,
		settings: {
			...s.settings,
			provider: { ...s.settings.provider },
			voiceBackend: { ...s.settings.voiceBackend },
		},
		messages: [...s.messages],
		memories: [...s.memories],
		inbox: [...s.inbox],
		boards: s.boards.map((b) => ({ ...b, items: [...(b.items ?? [])] })),
		timeLogs: [...s.timeLogs],
		insights: [...s.insights],
		mcpServers: [...s.mcpServers],
		automations: [...s.automations],
		sources: (s.sources ?? []).map((src) => ({
			...src,
			files: [...src.files],
			events: [...src.events],
			work: [...src.work],
		})),
	}
}

export function cloneEnv(env: EnvState): EnvState {
	return { snapshot: cloneSnapshot(env.snapshot), ui: { ...env.ui } }
}

export function snapshotSlice(env: EnvState) {
	return {
		memories: env.snapshot.memories,
		inbox: env.snapshot.inbox,
		boards: env.snapshot.boards,
		timeLogs: env.snapshot.timeLogs,
		insights: env.snapshot.insights,
		mcpServers: env.snapshot.mcpServers,
		automations: env.snapshot.automations,
		sources: env.snapshot.sources,
	}
}

export function uiSlice(env: EnvState): UiState {
	return { ...env.ui }
}
