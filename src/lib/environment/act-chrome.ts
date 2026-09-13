import { onboardingNeeded } from "../first-run.ts"
import { hostCaps } from "../host.ts"
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
import {
	activateProviderConnection,
	addProviderConnection,
	removeProviderConnection,
	renameProviderConnection,
} from "../types-connection-edit.ts"
import {
	patchProviderField,
	patchVoiceField,
	switchProviderSettings,
	switchVoiceSettings,
} from "../types-connections.ts"
import { type ActCtx, type ActResult, bool, fail, ok, str } from "./act-result.ts"
import { cloneEnv } from "./state.ts"
import type { EnvState, SettingsTab, WatchTab } from "./types.ts"

const SETTINGS_TABS = new Set<SettingsTab>(["general", "voice", "model", "tools", "sources", "data"])
const WATCH_TABS = new Set<WatchTab>(["inbox", "boards", "time"])
const DIALOGS = new Set<Exclude<DialogId, null>>(["watch", "settings", "artifact", "memory", "routines"])

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
	if (view === "history") {
		next.ui.conversationOpen = true
		next.ui.menuOpen = false
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
	if (args.query != null && next.ui.dialog === "memory") next.ui.memoryQuery = str(args, "query")
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
		next.ui.conversationOpen = false
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
	if (next.ui.conversationOpen) {
		next.ui.conversationOpen = false
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
	if (field === "voice") {
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
		if (str(args, "view") === "settings" && onboardingNeeded(snap.settings, hostCaps())) {
			return fail(command, "Finish setup first.", env)
		}
		return ok(command, `Opened ${str(args, "view")}.`, openView(env, args))
	}

	if (command === "ui.close") {
		const all = bool(args, "all") === true
		return ok(command, all ? "Closed all chrome." : "Closed.", closeUi(env, all))
	}

	if (command === "ui.focus") {
		const field = str(args, "field")
		if (!field) return fail(command, "Field required.", env)
		if (onboardingNeeded(snap.settings, hostCaps())) {
			return fail(command, "Finish setup first.", env)
		}
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
		for (const key of ["agentName", "userName", "brief"] as const) {
			if (args[key] != null) patch[key] = str(args, key)
		}
		if (typeof args.showCaptions === "boolean") patch.showCaptions = args.showCaptions
		snap.settings = { ...snap.settings, ...patch }
		return ok(command, "Updated settings.", next)
	}

	if (command === "settings.provider") {
		const id = str(args, "id") as ProviderId
		if (id && PROVIDER_PRESETS[id]) {
			snap.settings = {
				...snap.settings,
				...switchProviderSettings(snap.settings, id, args),
			}
			return ok(command, `Provider set to ${id}.`, next)
		}
		const field = str(args, "field") as "model" | "baseUrl" | "apiKey"
		if (field === "model" || field === "baseUrl" || field === "apiKey") {
			snap.settings = {
				...snap.settings,
				...patchProviderField(snap.settings, field, str(args, "value")),
			}
			return ok(command, `Provider ${field} updated.`, next)
		}
		return fail(command, "Provider id or field required.", env)
	}

	if (command === "settings.connection") {
		const add = str(args, "add") as ProviderId
		if (add && PROVIDER_PRESETS[add]) {
			const label = str(args, "label").trim()
			if (!label) return fail(command, "Name this connection.", env)
			if (snap.settings.connections.some((c) => c.label === label)) {
				return fail(command, "That name is already used.", env)
			}
			snap.settings = { ...snap.settings, ...addProviderConnection(snap.settings, add, label) }
			return ok(command, `Saved ${label}.`, next)
		}
		const id = str(args, "id")
		if (id && bool(args, "remove")) {
			if (snap.settings.connections.length <= 1) return fail(command, "Keep at least one connection.", env)
			snap.settings = { ...snap.settings, ...removeProviderConnection(snap.settings, id) }
			return ok(command, "Removed connection.", next)
		}
		const rename = str(args, "label").trim()
		if (id && rename) {
			if (snap.settings.connections.some((c) => c.id !== id && c.label === rename)) {
				return fail(command, "That name is already used.", env)
			}
			snap.settings = { ...snap.settings, ...renameProviderConnection(snap.settings, id, rename) }
			return ok(command, "Renamed connection.", next)
		}
		if (id) {
			snap.settings = { ...snap.settings, ...activateProviderConnection(snap.settings, id) }
			return ok(command, "Connection active.", next)
		}
		return fail(command, "Connection add, id, or remove required.", env)
	}

	if (command === "settings.voice") {
		const id = str(args, "id") as VoiceBackendId
		if (id && VOICE_PRESETS[id]) {
			snap.settings = {
				...snap.settings,
				...switchVoiceSettings(snap.settings, id, args),
			}
			return ok(command, `Voice backend set to ${id}.`, next)
		}
		const field = str(args, "field") as "model" | "baseUrl" | "apiKey" | "voice"
		if (field === "model" || field === "baseUrl" || field === "apiKey" || field === "voice") {
			snap.settings = {
				...snap.settings,
				...patchVoiceField(snap.settings, field, str(args, "value")),
			}
			return ok(command, `Voice ${field} updated.`, next)
		}
		return fail(command, "Voice id or field required.", env)
	}

	return null
}
