import { create } from "zustand"
import { type AutomationDraft } from "./automations"
import { act, emptyUiState, toolsFor, type UiState } from "./environment"
import { emptySnapshot, loadSnapshot, saveSnapshot } from "./persist"
import { recoverFromRenderError } from "./recover"
import { applyAct, applyEnv, envFromStore, envOf, type Live, takeSnapshot } from "./store-env"
import { createTurnActions } from "./store-turns"
import {
	type Artifact,
	type Automation,
	type DialogId,
	type Emotion,
	type McpServer,
	type Memory,
	type MemoryKind,
	type Message,
	normalizeSnapshot,
	type PresenceState,
	type Settings,
	type Snapshot,
	type Source,
} from "./types"
import { nowIso, uid } from "./utils"

type Actions = {
	hydrate: () => Promise<void>
	persist: () => void
	dispatch: (name: string, args?: Record<string, unknown>) => Promise<void>
	patchSettings: (partial: Partial<Settings>) => void
	applyProvider: (id: Settings["provider"]["id"]) => void
	setProviderField: (field: Exclude<keyof Settings["provider"], "id">, value: string) => void
	applyVoiceBackend: (id: Settings["voiceBackend"]["id"]) => void
	setVoiceBackendField: (field: Exclude<keyof Settings["voiceBackend"], "id">, value: string) => void
	commitVoiceUser: (text: string) => Message | null
	commitVoiceAssistant: (text: string) => void
	executeVoiceTool: (name: string, args: string) => Promise<{ content: string; artifact?: Artifact }>
	realtimeTools: () => import("./llm").ChatTool[]
	setPresence: (
		p: Partial<Pick<Live, "presence" | "emotion" | "level" | "bands" | "caption" | "interim" | "error">>,
	) => void
	openDialog: (d: DialogId) => void
	closeUi: (all?: boolean) => void
	openArtifact: (a: Artifact | null) => void
	setComposerOpen: (open: boolean) => void
	setVoiceMode: (on: boolean) => void
	setMenuOpen: (open: boolean) => void
	setSettingsTab: (tab: UiState["settingsTab"]) => void
	setWatchTab: (tab: UiState["watchTab"]) => void
	setHistoryMode: (mode: UiState["historyMode"]) => void
	setHistoryQuery: (q: string) => void
	setHistoryDay: (day: string | null) => void
	setMemoryQuery: (q: string) => void
	setMemoryKind: (kind: UiState["memoryKind"]) => void
	setRoutinesFormOpen: (open: boolean) => void
	addUserMessage: (text: string) => Message
	send: (text: string) => Promise<void>
	analyzeLived: () => Promise<void>
	addMcp: (server: Omit<McpServer, "tools" | "lastError" | "lastOkAt">) => void
	removeMcp: (id: string) => void
	toggleMcp: (id: string) => void
	testMcp: (id: string) => Promise<void>
	resolveInbox: (id: string) => void
	addMemory: (kind: MemoryKind, text: string, pinned?: boolean) => void
	updateMemory: (id: string, patch: Partial<Pick<Memory, "text" | "kind" | "pinned">>) => void
	forgetMemory: (id: string) => void
	deleteBoard: (id: string) => void
	addAutomation: (draft: AutomationDraft) => void
	updateAutomation: (id: string, patch: Partial<Pick<Automation, "name" | "brief" | "enabled" | "trigger">>) => void
	removeAutomation: (id: string) => void
	runAutomation: (id: string, opts?: { speak?: boolean }) => Promise<void>
	tickAutomations: () => Promise<void>
	attachSource: (name: string, files: { name: string; text: string }[]) => void
	connectSource: (kind: "calendar" | "work", name: string, origin: string, authHeader?: string) => Promise<void>
	removeSource: (id: string) => void
	syncSource: (id: string) => Promise<void>
	wipe: () => Promise<void>
	exportJson: () => string
	importJson: (raw: string) => void
	recoverFromError: () => void
}

export type AppStore = Snapshot & Live & Actions

let persistTimer: ReturnType<typeof setTimeout> | null = null

export const useApp = create<AppStore>((set, get) => {
	const turns = createTurnActions(get, set)
	const persist = () => {
		if (persistTimer) clearTimeout(persistTimer)
		persistTimer = setTimeout(() => {
			void saveSnapshot(takeSnapshot(get())).catch((err) => {
				console.error("[moya] persist failed", err)
			})
		}, 180)
	}
	const run = (name: string, args: Record<string, unknown> = {}) => applyAct(get, set, name, args, persist)

	return {
		...emptySnapshot(),
		ready: false,
		presence: "idle" as PresenceState,
		emotion: "calm" as Emotion,
		level: 0,
		bands: Array.from({ length: 24 }, () => 0.12),
		caption: "",
		interim: "",
		error: null,
		runningAutomation: null,
		...emptyUiState(),
		...turns,
		persist,

		hydrate: async () => {
			const snap = normalizeSnapshot(await loadSnapshot())
			set((s) => {
				if (s.messages.length > 0 || s.presence === "thinking" || s.presence === "speaking") {
					return { ready: true }
				}
				return { ...snap, ready: true }
			})
		},

		dispatch: async (name, args) => {
			await run(name, args ?? {})
		},

		patchSettings: (partial) => {
			void run("settings.patch", partial as Record<string, unknown>)
		},
		applyProvider: (id) => {
			void run("settings.provider", { id })
		},
		setProviderField: (field, value) => {
			void run("settings.provider", { field, value })
		},
		applyVoiceBackend: (id) => {
			void run("settings.voice", { id })
		},
		setVoiceBackendField: (field, value) => {
			void run("settings.voice", { field, value })
		},

		realtimeTools: () => toolsFor(envFromStore(get())),
		setPresence: (p) => set(p),

		openDialog: (d) => {
			if (d) void run("ui.open", { view: d })
			else void run("ui.close", {})
		},
		closeUi: (all = false) => {
			void run("ui.close", { all })
		},
		openArtifact: (a) => {
			if (!a) {
				void run("ui.close", {})
				return
			}
			void run("ui.sketch", { artifact: a })
		},
		setComposerOpen: (open) => set({ composerOpen: open }),
		setVoiceMode: (on) => set({ voiceMode: on, composerOpen: on ? false : get().composerOpen }),
		setMenuOpen: (open) => {
			if (open) void run("ui.open", { view: "menu" })
			else if (get().menuOpen) void run("ui.close", {})
		},
		setSettingsTab: (tab) => set({ settingsTab: tab }),
		setWatchTab: (tab) => set({ watchTab: tab }),
		setHistoryMode: (mode) => set({ historyMode: mode }),
		setHistoryQuery: (q) => set({ historyQuery: q }),
		setHistoryDay: (day) => set({ historyDay: day }),
		setMemoryQuery: (q) => set({ memoryQuery: q }),
		setMemoryKind: (kind) => set({ memoryKind: kind }),
		setRoutinesFormOpen: (open) => set({ routinesFormOpen: open }),

		addUserMessage: (text) => {
			const msg: Message = { id: uid("u"), role: "user", content: text, createdAt: nowIso() }
			set((s) => ({ messages: [...s.messages, msg] }))
			get().persist()
			return msg
		},

		analyzeLived: async () => {
			await run("lived.analyze", {})
		},
		addMcp: (server) => {
			void run("mcp.add", server as unknown as Record<string, unknown>)
		},
		removeMcp: (id) => {
			void run("mcp.remove", { id })
		},
		toggleMcp: (id) => {
			void run("mcp.toggle", { id })
		},
		testMcp: async (id) => {
			const { env, receipt } = await act(envFromStore(get()), "mcp.test", { id })
			set(applyEnv(env))
			get().persist()
			if (!receipt.ok) set({ error: receipt.summary })
		},
		resolveInbox: (id) => {
			void run("inbox.resolve", { id })
		},
		addMemory: (kind, text, pinned = false) => {
			void run("memory.write", { kind, text, pinned })
		},
		updateMemory: (id, patch) => {
			void run("memory.update", { id, ...patch })
		},
		forgetMemory: (id) => {
			void run("memory.forget", { id })
		},
		deleteBoard: (id) => {
			void run("board.delete", { id })
		},
		updateAutomation: (id, patch) => {
			void run("routine.update", { id, ...patch })
		},
		removeAutomation: (id) => {
			void run("routine.remove", { id })
		},
		attachSource: (name, files) => {
			void run("source.attach", { name, files })
		},
		connectSource: async (kind, name, origin, authHeader) => {
			await run("source.connect", { kind, name, origin, authHeader })
		},
		removeSource: (id) => {
			void run("source.remove", { id })
		},
		syncSource: async (id) => {
			await run("source.sync", { id })
		},
		wipe: async () => {
			await run("data.wipe", {})
			set({
				ready: true,
				caption: "",
				interim: "",
				error: null,
				presence: "idle",
				runningAutomation: null,
			})
		},
		exportJson: () => JSON.stringify(takeSnapshot(get()), null, 2),
		recoverFromError: () => set(recoverFromRenderError()),
		importJson: (raw) => {
			void run("data.import", { raw })
		},
	}
})

export function pendingInboxCount(inbox: { resolvedAt: string | null }[]) {
	return inbox.filter((i) => !i.resolvedAt).length
}

export function pendingRoutineCount(autos: Automation[]) {
	return autos.filter((a) => a.enabled).length
}

export type { Source }
export { envOf }
