import { act, type EnvState, type UiState } from "./environment"
import { normalizeSettings, type Snapshot } from "./types"

export type Live = {
	ready: boolean
	presence: import("./types").PresenceState
	emotion: import("./types").Emotion
	level: number
	bands: number[]
	caption: string
	interim: string
	voiceMode: boolean
	composerOpen: boolean
	dialog: import("./types").DialogId
	artifact: import("./types").Artifact | null
	error: string | null
	runningAutomation: string | null
} & Omit<UiState, "dialog" | "artifact" | "composerOpen" | "voiceMode">

export function takeSnapshot(s: Snapshot): Snapshot {
	return {
		version: 1,
		settings: normalizeSettings(s.settings),
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

export function uiFromStore(s: Live): UiState {
	return {
		dialog: s.dialog,
		artifact: s.artifact,
		composerOpen: s.composerOpen,
		voiceMode: s.voiceMode,
		menuOpen: s.menuOpen,
		settingsTab: s.settingsTab,
		watchTab: s.watchTab,
		historyMode: s.historyMode,
		historyQuery: s.historyQuery,
		historyDay: s.historyDay,
		memoryQuery: s.memoryQuery,
		memoryKind: s.memoryKind,
		routinesFormOpen: s.routinesFormOpen,
		focusField: s.focusField,
	}
}

export function envFromStore(s: Snapshot & Live): EnvState {
	return { snapshot: takeSnapshot(s), ui: uiFromStore(s) }
}

export function applyEnv(env: EnvState) {
	return {
		...env.snapshot,
		...env.ui,
	}
}

export async function applyAct(
	get: () => Snapshot & Live,
	set: (p: Partial<Snapshot & Live>) => void,
	name: string,
	args: Record<string, unknown> = {},
	persist: () => void,
) {
	const { env } = await act(envFromStore(get()), name, args)
	set(applyEnv(env))
	persist()
}

export function envOf(s: Snapshot & Live): EnvState {
	return envFromStore(s)
}
