import type { ProviderConfig, ProviderId, Settings, VoiceBackendId, VoiceConfig } from "./types.ts"
import { localConversationVoice, PROVIDER_PRESETS, VOICE_PRESETS } from "./types-presets.ts"
import { uid } from "./utils.ts"
export interface ProviderConnection {
	id: string
	providerId: ProviderId
	label: string
	baseUrl: string
	apiKey: string
	lastModel: string
}
export interface VoiceConnection {
	id: string
	backendId: VoiceBackendId
	label: string
	baseUrl: string
	apiKey: string
	lastModel: string
	lastVoice: string
}
export const DEFAULT_PROVIDER_CONNECTION_ID = "conn_ondevice"
export const DEFAULT_VOICE_CONNECTION_ID = "vconn_custom"

export function defaultSettingsVault(): Pick<
	Settings,
	"connections" | "activeConnectionId" | "voiceConnections" | "activeVoiceConnectionId"
> {
	return {
		connections: [
			{
				id: DEFAULT_PROVIDER_CONNECTION_ID,
				providerId: "ondevice",
				label: "On-device",
				baseUrl: "",
				apiKey: "",
				lastModel: "",
			},
		],
		activeConnectionId: DEFAULT_PROVIDER_CONNECTION_ID,
		voiceConnections: [
			{
				id: DEFAULT_VOICE_CONNECTION_ID,
				backendId: "custom",
				label: "Custom OpenAI-compatible",
				baseUrl: "",
				apiKey: "",
				lastModel: "",
				lastVoice: "",
			},
		],
		activeVoiceConnectionId: DEFAULT_VOICE_CONNECTION_ID,
	}
}

function httpBase(baseUrl: string): string {
	return baseUrl
		.trim()
		.replace(/\/+$/, "")
		.replace(/\/realtime$/i, "")
}

function argString(args: Record<string, unknown>, key: string): string | undefined {
	if (!(key in args)) return undefined
	const v = args[key]
	return typeof v === "string" ? v : v == null ? "" : String(v)
}

export function providerFromConnection(connection: ProviderConnection, liveModel = ""): ProviderConfig {
	const preset = PROVIDER_PRESETS[connection.providerId]
	return {
		id: connection.providerId,
		model: connection.providerId === "ondevice" ? connection.lastModel : liveModel.trim() || preset.model,
		baseUrl: connection.providerId === "ondevice" ? "" : connection.baseUrl,
		apiKey: connection.apiKey,
	}
}

export function voiceFromConnection(connection: VoiceConnection): VoiceConfig {
	return {
		id: connection.backendId,
		model: connection.lastModel,
		baseUrl: connection.baseUrl,
		apiKey: connection.apiKey,
		voice: connection.backendId === "s2s" ? localConversationVoice(connection.lastVoice) : connection.lastVoice,
	}
}

export function findProviderConnection(
	connections: ProviderConnection[],
	providerId: ProviderId,
	baseUrl?: string,
): ProviderConnection | undefined {
	if (providerId === "custom") {
		if (baseUrl != null && baseUrl.trim()) {
			const want = httpBase(baseUrl)
			const exact = connections.find((c) => c.providerId === "custom" && httpBase(c.baseUrl) === want)
			if (exact) return exact
		}
		return connections.find((c) => c.providerId === "custom")
	}
	return connections.find((c) => c.providerId === providerId)
}

export function findVoiceConnection(
	connections: VoiceConnection[],
	backendId: VoiceBackendId,
	baseUrl?: string,
): VoiceConnection | undefined {
	if (backendId === "custom") {
		if (baseUrl != null && baseUrl.trim()) {
			const want = httpBase(baseUrl)
			const exact = connections.find((c) => c.backendId === "custom" && httpBase(c.baseUrl) === want)
			if (exact) return exact
		}
		return connections.find((c) => c.backendId === "custom")
	}
	return connections.find((c) => c.backendId === backendId)
}

function connectionFromProvider(provider: ProviderConfig, id = uid("conn")): ProviderConnection {
	return {
		id,
		providerId: provider.id,
		label: PROVIDER_PRESETS[provider.id].label,
		baseUrl: provider.id === "ondevice" ? "" : provider.baseUrl,
		apiKey: provider.apiKey,
		lastModel: provider.id === "ondevice" ? provider.model : "",
	}
}

function connectionFromVoice(voice: VoiceConfig, id = uid("vconn")): VoiceConnection {
	return {
		id,
		backendId: voice.id,
		label: VOICE_PRESETS[voice.id].label,
		baseUrl: voice.baseUrl,
		apiKey: voice.apiKey,
		lastModel: voice.model,
		lastVoice: voice.id === "s2s" ? localConversationVoice(voice.voice) : voice.voice,
	}
}

export function upsertProviderFromLive(settings: Pick<Settings, "provider" | "connections">): ProviderConnection[] {
	const e = findProviderConnection(settings.connections, settings.provider.id, settings.provider.baseUrl)
	const n = {
		...connectionFromProvider(settings.provider, e?.id),
		label: e?.label || PROVIDER_PRESETS[settings.provider.id].label,
	}
	return e ? settings.connections.map((c) => (c.id === e.id ? n : c)) : [...settings.connections, n]
}

export function upsertVoiceFromLive(settings: Pick<Settings, "voiceBackend" | "voiceConnections">): VoiceConnection[] {
	const e = findVoiceConnection(settings.voiceConnections, settings.voiceBackend.id, settings.voiceBackend.baseUrl)
	const n = connectionFromVoice(settings.voiceBackend, e?.id)
	return e ? settings.voiceConnections.map((c) => (c.id === e.id ? n : c)) : [...settings.voiceConnections, n]
}

export function switchProviderSettings(
	settings: Pick<Settings, "provider" | "connections">,
	id: ProviderId,
	args: Record<string, unknown> = {},
): Pick<Settings, "provider" | "connections" | "activeConnectionId"> {
	const preset = PROVIDER_PRESETS[id]
	let connections = upsertProviderFromLive(settings)
	const argBase = argString(args, "baseUrl")
	const argModel = argString(args, "model")
	const argKey = argString(args, "apiKey")
	let found = findProviderConnection(connections, id, argBase)
	if (!found) {
		found = connectionFromProvider({
			id,
			model: argModel ?? preset.model,
			baseUrl: id === "ondevice" ? "" : argBase || preset.baseUrl,
			apiKey: argKey ?? "",
		})
		connections = [...connections, found]
	} else {
		found = {
			...found,
			label: preset.label,
			baseUrl: id === "ondevice" ? "" : argBase !== undefined && argBase.trim() ? argBase : found.baseUrl,
			apiKey: argKey !== undefined ? argKey : found.apiKey,
			lastModel: id === "ondevice" ? (argModel !== undefined ? argModel : found.lastModel) : "",
		}
		connections = connections.map((c) => (c.id === found?.id ? found : c))
	}
	return {
		connections,
		activeConnectionId: found.id,
		provider: providerFromConnection(found, id === "ondevice" ? found.lastModel : argModel),
	}
}

export function patchProviderField(
	settings: Pick<Settings, "provider" | "connections" | "activeConnectionId">,
	field: "model" | "baseUrl" | "apiKey",
	value: string,
): Pick<Settings, "provider" | "connections" | "activeConnectionId"> {
	const live: ProviderConfig = { ...settings.provider, [field]: value }
	if (live.id === "ondevice") live.baseUrl = ""
	const connections = upsertProviderFromLive(settings)
	const active =
		connections.find((c) => c.id === settings.activeConnectionId) ??
		findProviderConnection(connections, settings.provider.id, settings.provider.baseUrl)
	if (!active) {
		return switchProviderSettings({ provider: live, connections }, live.id, {
			model: live.model,
			baseUrl: live.baseUrl,
			apiKey: live.apiKey,
		})
	}
	const patched: ProviderConnection = {
		...active,
		label: PROVIDER_PRESETS[live.id].label,
		lastModel: field === "model" && live.id === "ondevice" ? value : active.lastModel,
		baseUrl: field === "baseUrl" ? live.baseUrl : active.baseUrl,
		apiKey: field === "apiKey" ? value : active.apiKey,
	}
	return {
		connections: connections.map((c) => (c.id === patched.id ? patched : c)),
		activeConnectionId: patched.id,
		provider: field === "model" && live.id !== "ondevice" ? { ...live } : providerFromConnection(patched, live.model),
	}
}

export function switchVoiceSettings(
	settings: Pick<Settings, "voiceBackend" | "voiceConnections">,
	id: VoiceBackendId,
	args: Record<string, unknown> = {},
): Pick<Settings, "voiceBackend" | "voiceConnections" | "activeVoiceConnectionId"> {
	const preset = VOICE_PRESETS[id]
	let voiceConnections = upsertVoiceFromLive(settings)
	const argBase = argString(args, "baseUrl")
	const argModel = argString(args, "model")
	const argKey = argString(args, "apiKey")
	const argVoice = argString(args, "voice")
	let found = findVoiceConnection(voiceConnections, id, argBase)
	if (!found) {
		found = connectionFromVoice({
			id,
			model: argModel ?? preset.model,
			baseUrl: argBase || preset.baseUrl,
			apiKey: argKey ?? "",
			voice: argVoice ?? preset.voice,
		})
		voiceConnections = [...voiceConnections, found]
	} else {
		found = {
			...found,
			label: preset.label,
			baseUrl: argBase !== undefined && argBase.trim() ? argBase : found.baseUrl,
			apiKey: argKey !== undefined ? argKey : found.apiKey,
			lastModel: argModel !== undefined ? argModel : found.lastModel,
			lastVoice: argVoice !== undefined ? argVoice : found.lastVoice,
		}
		if (found.backendId === "s2s") found.lastVoice = localConversationVoice(found.lastVoice)
		voiceConnections = voiceConnections.map((c) => (c.id === found?.id ? found : c))
	}
	return {
		voiceConnections,
		activeVoiceConnectionId: found.id,
		voiceBackend: voiceFromConnection(found),
	}
}

export function patchVoiceField(
	settings: Pick<Settings, "voiceBackend" | "voiceConnections" | "activeVoiceConnectionId">,
	field: "model" | "baseUrl" | "apiKey" | "voice",
	value: string,
): Pick<Settings, "voiceBackend" | "voiceConnections" | "activeVoiceConnectionId"> {
	const live: VoiceConfig = { ...settings.voiceBackend, [field]: value }
	if (live.id === "s2s" && field === "voice") live.voice = localConversationVoice(value)
	const voiceConnections = upsertVoiceFromLive(settings)
	const active =
		voiceConnections.find((c) => c.id === settings.activeVoiceConnectionId) ??
		findVoiceConnection(voiceConnections, settings.voiceBackend.id, settings.voiceBackend.baseUrl)
	if (!active) {
		return switchVoiceSettings({ voiceBackend: live, voiceConnections }, live.id, {
			model: live.model,
			baseUrl: live.baseUrl,
			apiKey: live.apiKey,
			voice: live.voice,
		})
	}
	const patched: VoiceConnection = {
		...active,
		label: VOICE_PRESETS[live.id].label,
		lastModel: field === "model" ? value : active.lastModel,
		baseUrl: field === "baseUrl" ? live.baseUrl : active.baseUrl,
		apiKey: field === "apiKey" ? value : active.apiKey,
		lastVoice: field === "voice" ? live.voice : active.lastVoice,
	}
	if (patched.backendId === "s2s") patched.lastVoice = localConversationVoice(patched.lastVoice)
	return {
		voiceConnections: voiceConnections.map((c) => (c.id === patched.id ? patched : c)),
		activeVoiceConnectionId: patched.id,
		voiceBackend: voiceFromConnection(patched),
	}
}
