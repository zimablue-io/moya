import {
	type Artifact,
	type DialogId,
	type MemoryKind,
	normalizeArtifact,
	PROVIDER_PRESETS,
	type ProviderId,
	type Settings,
	VOICE_PRESETS,
	type VoiceBackendId,
} from "../types.ts"
import { type ActCtx, type ActResult, bool, fail, ok, str } from "./act-result.ts"
import { cloneEnv } from "./state.ts"
import type { EnvState, HistoryMode, SettingsTab, WatchTab } from "./types.ts"

const SETTINGS_TABS = new Set<SettingsTab>(["general", "voice", "model", "tools", "sources", "data"])
const WATCH_TABS = new Set<WatchTab>(["inbox", "boards", "time"])
const HISTORY_MODES = new Set<HistoryMode>(["list", "calendar"])
const DIALOGS = new Set<Exclude<DialogId, null>>(["history", "watch", "settings", "artifact", "memory", "routines"])

function openView(env: EnvState, args: Record<string, unknown>): EnvState {
	const view = str(args, "view")
	const next = cloneEnv(env)
	next.ui.menuOpen = view === "menu"
	next.ui.focusField = null
	if (view === "menu") return next

	if (view === "projects" || view === "boards") {
		next.ui.dialog = "watch"
		next.ui.watchTab = "boards"
		next.ui.artifact = null
		return next
	}
	if (view === "inbox") {
		next.ui.dialog = "watch"
		next.ui.watchTab = "inbox"
		next.ui.artifact = null
		return next
	}
	if (view === "time" || view === "calendar") {
		next.ui.dialog = "watch"
		next.ui.watchTab = "time"
		next.ui.artifact = null
		return next
	}
	if (DIALOGS.has(view as Exclude<DialogId, null>)) {
		next.ui.dialog = view as DialogId
		next.ui.artifact = view === "artifact" ? next.ui.artifact : null
	}
	const tab = str(args, "tab")
	if (SETTINGS_TABS.has(tab as SettingsTab)) next.ui.settingsTab = tab as SettingsTab
	if (WATCH_TABS.has(tab as WatchTab)) next.ui.watchTab = tab as WatchTab
	if (HISTORY_MODES.has(str(args, "mode") as HistoryMode)) next.ui.historyMode = str(args, "mode") as HistoryMode
	if (args.day != null) next.ui.historyDay = str(args, "day") || null
	if (args.query != null) {
		if (next.ui.dialog === "memory") next.ui.memoryQuery = str(args, "query")
		else next.ui.historyQuery = str(args, "query")
	}
	if (args.kind != null && next.ui.dialog === "memory") {
		next.ui.memoryKind = str(args, "kind") === "all" ? "all" : (str(args, "kind") as MemoryKind)
	}
	return next
}

function closeUi(env: EnvState, all: boolean): EnvState {
	const next = cloneEnv(env)
	if (all) {
		next.ui.dialog = null
		next.ui.artifact = null
		next.ui.menuOpen = false
		next.ui.composerOpen = false
		next.ui.focusField = null
		next.ui.routinesFormOpen = false
		return next
	}
	if (next.ui.artifact || next.ui.dialog === "artifact") {
		next.ui.artifact = null
		next.ui.dialog = null
		next.ui.focusField = null
		return next
	}
	if (next.ui.dialog) {
		next.ui.dialog = null
		next.ui.focusField = null
		return next
	}
	if (next.ui.menuOpen) {
		next.ui.menuOpen = false
		return next
	}
	next.ui.composerOpen = false
	next.ui.focusField = null
	return next
}

function fieldView(field: string): { view: string; tab?: SettingsTab } {
	if (field === "apiKey" || field === "provider" || field === "model" || field === "baseUrl") {
		return { view: "settings", tab: "model" }
	}
	if (field === "voice" || field === "voiceURI" || field === "rate" || field === "pitch") {
		return { view: "settings", tab: "voice" }
	}
	if (field === "agentName" || field === "userName" || field === "brief") {
		return { view: "settings", tab: "general" }
	}
	return { view: "settings", tab: "general" }
}

export function actChrome(ctx: ActCtx): ActResult | null {
	const { command, env, next, args } = ctx
	const snap = next.snapshot

	if (command === "ui.open") {
		if (!str(args, "view")) return fail(command, "View required.", env)
		return ok(command, `Opened ${str(args, "view")}.`, openView(env, args))
	}

	if (command === "ui.close") {
		const all = bool(args, "all") === true
		return ok(command, all ? "Closed all chrome." : "Closed.", closeUi(env, all))
	}

	if (command === "ui.focus") {
		const field = str(args, "field")
		if (!field) return fail(command, "Field required.", env)
		const hint = fieldView(field)
		const opened = openView(env, {
			view: str(args, "view") || hint.view,
			tab: str(args, "tab") || hint.tab,
		})
		opened.ui.focusField = field
		return ok(command, `Focused ${field}.`, opened, { field })
	}

	if (command === "ui.sketch") {
		const artifact = normalizeArtifact(args.artifact ?? (args.type ? args : undefined))
		if (!artifact) return fail(command, "No sketch provided.", env)
		const sketched: Artifact = { ...artifact, grounding: "sketch" }
		next.ui.artifact = sketched
		next.ui.dialog = "artifact"
		return ok(command, `Sketch: ${sketched.type} “${sketched.title}”.`, next, { title: sketched.title })
	}

	if (command === "settings.patch") {
		const patch: Partial<Settings> = {}
		for (const key of ["agentName", "userName", "brief", "voiceURI"] as const) {
			if (args[key] != null) patch[key] = str(args, key)
		}
		for (const key of ["autoSpeak", "showCaptions"] as const) {
			if (typeof args[key] === "boolean") patch[key] = args[key] as boolean
		}
		if (typeof args.rate === "number") patch.rate = args.rate
		if (typeof args.pitch === "number") patch.pitch = args.pitch
		snap.settings = { ...snap.settings, ...patch }
		return ok(command, "Updated settings.", next)
	}

	if (command === "settings.provider") {
		const id = str(args, "id") as ProviderId
		if (id && PROVIDER_PRESETS[id]) {
			const preset = PROVIDER_PRESETS[id]
			snap.settings = {
				...snap.settings,
				provider: { id, model: preset.model, baseUrl: preset.baseUrl, apiKey: "" },
			}
			return ok(command, `Provider set to ${id}.`, next)
		}
		const field = str(args, "field") as "model" | "baseUrl" | "apiKey"
		if (field === "model" || field === "baseUrl" || field === "apiKey") {
			snap.settings = {
				...snap.settings,
				provider: { ...snap.settings.provider, [field]: str(args, "value") },
			}
			return ok(command, `Provider ${field} updated.`, next)
		}
		return fail(command, "Provider id or field required.", env)
	}

	if (command === "settings.voice") {
		const id = str(args, "id") as VoiceBackendId
		if (id && VOICE_PRESETS[id]) {
			const preset = VOICE_PRESETS[id]
			snap.settings = {
				...snap.settings,
				voiceBackend: { id, model: preset.model, baseUrl: preset.baseUrl, apiKey: "", voice: preset.voice },
			}
			return ok(command, `Voice backend set to ${id}.`, next)
		}
		const field = str(args, "field") as "model" | "baseUrl" | "apiKey" | "voice"
		if (field === "model" || field === "baseUrl" || field === "apiKey" || field === "voice") {
			snap.settings = {
				...snap.settings,
				voiceBackend: { ...snap.settings.voiceBackend, [field]: str(args, "value") },
			}
			return ok(command, `Voice ${field} updated.`, next)
		}
		return fail(command, "Voice id or field required.", env)
	}

	return null
}
