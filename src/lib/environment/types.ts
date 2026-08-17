import type { Artifact, DialogId, MemoryKind, Snapshot, Source } from "../types.ts"

export type HistoryMode = "list" | "calendar"
export type SettingsTab = "general" | "voice" | "model" | "tools" | "sources" | "data"
export type WatchTab = "inbox" | "boards" | "time"

export type { Source }

export type UiState = {
	dialog: DialogId
	artifact: Artifact | null
	composerOpen: boolean
	voiceMode: boolean
	menuOpen: boolean
	settingsTab: SettingsTab
	watchTab: WatchTab
	historyMode: HistoryMode
	historyQuery: string
	historyDay: string | null
	memoryQuery: string
	memoryKind: MemoryKind | "all"
	routinesFormOpen: boolean
	focusField: string | null
}

export type EnvState = {
	snapshot: Snapshot
	ui: UiState
}

export type Receipt = {
	command: string
	ok: boolean
	summary: string
	data?: unknown
}

export type QueryArgs = {
	domain?: "lived" | "ui" | "sources" | "transcript" | "calendar" | "work" | "all"
	q?: string
	day?: string
}

export const FORBIDDEN_COMMANDS = [
	"fs.delete",
	"fs.write",
	"fs.remove",
	"fs.rm",
	"shell",
	"github.delete",
	"github.merge",
	"github.push",
	"git.write",
	"mail.send",
	"calendar.delete",
	"issue.close",
	"drive.delete",
] as const
