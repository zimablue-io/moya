import { callMcpTool, handshakeMcp } from "../mcp.ts"
import { emptySnapshot } from "../persist.ts"
import { type Automation, type AutomationTrigger, type McpServer, normalizeSnapshot } from "../types.ts"
import { nowIso, uid } from "../utils.ts"
import { type ActCtx, type ActResult, bool, fail, ok, str } from "./act-result.ts"
import { emptyUiState } from "./state.ts"

function parseTrigger(args: Record<string, unknown>): AutomationTrigger | null {
	const t = str(args, "triggerType")
	if (t === "manual") return { type: "manual" }
	if (t === "interval") return { type: "interval", everyMinutes: Math.max(5, Number(args.everyMinutes ?? 60)) }
	if (t === "daily") return { type: "daily", hour: Number(args.hour ?? 9), minute: Number(args.minute ?? 0) }
	if (t === "phrase") return { type: "phrase", pattern: str(args, "pattern").trim() || "remember" }
	return null
}

export async function actRemote(ctx: ActCtx): Promise<ActResult | null> {
	const { command, env, next, args } = ctx
	const snap = next.snapshot

	if (command === "routine.upsert") {
		const trigger = parseTrigger(args)
		const id = str(args, "id")
		const existing = id ? snap.automations.find((a) => a.id === id) : undefined
		if (existing) {
			snap.automations = snap.automations.map((a) =>
				a.id === existing.id
					? {
							...a,
							name: str(args, "name", a.name) || a.name,
							brief: str(args, "brief", a.brief) || a.brief,
							enabled: bool(args, "enabled") ?? a.enabled,
							trigger: trigger ?? a.trigger,
						}
					: a,
			)
			return ok(command, `Updated routine ${existing.name}`, next, { id: existing.id })
		}
		const auto: Automation = {
			id: uid("auto"),
			name: str(args, "name", "Routine"),
			brief: str(args, "brief"),
			enabled: args.enabled !== false,
			trigger: trigger ?? { type: "manual" },
			lastRunAt: null,
			lastResult: "",
			createdAt: nowIso(),
		}
		snap.automations = [auto, ...snap.automations]
		return ok(command, `Created routine ${auto.name}`, next, { id: auto.id })
	}

	if (command === "routine.update") {
		const id = str(args, "id")
		if (!id) return fail(command, "Routine id required.", env)
		const found = snap.automations.find((a) => a.id === id)
		if (!found) return fail(command, "Routine not found.", env)
		snap.automations = snap.automations.map((a) =>
			a.id === id
				? {
						...a,
						name: args.name != null ? str(args, "name") : a.name,
						brief: args.brief != null ? str(args, "brief") : a.brief,
						enabled: bool(args, "enabled") ?? a.enabled,
					}
				: a,
		)
		return ok(command, `Updated routine ${found.name}.`, next, { id })
	}

	if (command === "routine.remove") {
		const id = str(args, "id")
		if (!id) return fail(command, "Routine id required.", env)
		if (!snap.automations.some((a) => a.id === id)) return fail(command, "Routine not found.", env)
		snap.automations = snap.automations.filter((a) => a.id !== id)
		return ok(command, `Removed routine ${id}.`, next, { id })
	}

	if (command === "mcp.add") {
		const server: McpServer = {
			id: str(args, "id") || uid("mcp"),
			name: str(args, "name"),
			url: str(args, "url"),
			authHeader: str(args, "authHeader"),
			enabled: args.enabled !== false,
			tools: [],
		}
		snap.mcpServers = [...snap.mcpServers, server]
		return ok(command, `Added MCP ${server.name}.`, next, { id: server.id })
	}

	if (command === "mcp.remove") {
		const id = str(args, "id")
		if (!id) return fail(command, "MCP id required.", env)
		snap.mcpServers = snap.mcpServers.filter((m) => m.id !== id)
		return ok(command, `Removed MCP ${id}.`, next, { id })
	}

	if (command === "mcp.toggle") {
		const id = str(args, "id")
		if (!id) return fail(command, "MCP id required.", env)
		if (!snap.mcpServers.some((m) => m.id === id)) return fail(command, "MCP server not found.", env)
		snap.mcpServers = snap.mcpServers.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
		return ok(command, `Toggled MCP ${id}.`, next, { id })
	}

	if (command === "mcp.test") {
		const id = str(args, "id")
		const server = snap.mcpServers.find((m) => m.id === id)
		if (!server) return fail(command, "MCP server not found.", env)
		const { server: updated, error } = await handshakeMcp(server)
		snap.mcpServers = snap.mcpServers.map((m) => (m.id === id ? updated : m))
		if (error) return fail(command, error, next)
		return ok(command, `MCP ${updated.name} connected.`, next, { tools: (updated.tools ?? []).length })
	}

	if (command === "mcp.call") {
		const serverId = str(args, "serverId")
		const tool = str(args, "tool")
		const server = snap.mcpServers.find((s) => s.id === serverId)
		if (!server) return fail(command, `MCP server ${serverId} is gone.`, env)
		const content = await callMcpTool(server, tool, (args.args as Record<string, unknown>) ?? {})
		return ok(command, content.slice(0, 400), next, { content })
	}

	if (command === "data.wipe") {
		return ok(command, "Wiped Moya's local mind on this device.", {
			snapshot: emptySnapshot(),
			ui: emptyUiState(),
		})
	}

	if (command === "data.import") {
		try {
			const parsed = JSON.parse(str(args, "raw")) as { version?: number }
			if (parsed.version !== 1) return fail(command, "Unknown snapshot version.", env)
			next.snapshot = normalizeSnapshot(parsed)
			return ok(command, "Imported local snapshot.", next)
		} catch (err) {
			return fail(command, err instanceof Error ? err.message : "Could not import that file.", env)
		}
	}

	return null
}
