import type { ProviderId, Settings } from "./types.ts"
import { type ProviderConnection, providerFromConnection, upsertProviderFromLive } from "./types-connections.ts"
import { PROVIDER_PRESETS } from "./types-presets.ts"
import { uid } from "./utils.ts"

export function addProviderConnection(
	settings: Pick<Settings, "provider" | "connections">,
	providerId: ProviderId,
	label: string,
): Pick<Settings, "provider" | "connections" | "activeConnectionId"> {
	const connections = upsertProviderFromLive(settings)
	const preset = PROVIDER_PRESETS[providerId]
	const name = label.trim()
	const row: ProviderConnection = {
		id: uid("conn"),
		providerId,
		label: name,
		baseUrl: providerId === "ondevice" ? "" : preset.baseUrl,
		apiKey: "",
		lastModel: "",
	}
	return {
		connections: [...connections, row],
		activeConnectionId: row.id,
		provider: providerFromConnection(row),
	}
}

export function renameProviderConnection(
	settings: Pick<Settings, "provider" | "connections" | "activeConnectionId">,
	connectionId: string,
	label: string,
): Pick<Settings, "provider" | "connections" | "activeConnectionId"> {
	const name = label.trim()
	return {
		connections: settings.connections.map((c) => (c.id === connectionId ? { ...c, label: name } : c)),
		activeConnectionId: settings.activeConnectionId,
		provider: settings.provider,
	}
}

export function activateProviderConnection(
	settings: Pick<Settings, "provider" | "connections">,
	connectionId: string,
): Pick<Settings, "provider" | "connections" | "activeConnectionId"> {
	const connections = upsertProviderFromLive(settings)
	const row = connections.find((c) => c.id === connectionId)
	if (!row) {
		return {
			connections,
			activeConnectionId: connections[0]?.id ?? "",
			provider: settings.provider,
		}
	}
	return {
		connections,
		activeConnectionId: row.id,
		provider: providerFromConnection(row),
	}
}

export function removeProviderConnection(
	settings: Pick<Settings, "provider" | "connections" | "activeConnectionId">,
	connectionId: string,
): Pick<Settings, "provider" | "connections" | "activeConnectionId"> {
	const connections = settings.connections.filter((c) => c.id !== connectionId)
	if (!connections.length) {
		return addProviderConnection({ provider: settings.provider, connections: [] }, "custom", "Custom")
	}
	const keep =
		settings.activeConnectionId === connectionId
			? connections[0]
			: (connections.find((c) => c.id === settings.activeConnectionId) ?? connections[0])
	if (!keep) {
		return addProviderConnection({ provider: settings.provider, connections: [] }, "custom", "Custom")
	}
	return {
		connections,
		activeConnectionId: keep.id,
		provider: providerFromConnection(keep),
	}
}
