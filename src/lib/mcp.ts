import { mcpCall } from "./llm.ts"
import type { McpServer, McpTool } from "./types.ts"

type JsonRpc = { jsonrpc?: string; id?: number; result?: unknown; error?: { message?: string } }

function parseMcpBody(jsonText: string, contentType: string): JsonRpc | null {
	const raw = jsonText.trim()
	if (!raw) return null
	if (contentType.includes("text/event-stream")) {
		const dataLine = raw
			.split("\n")
			.reverse()
			.find((l) => l.startsWith("data:"))
		if (!dataLine) return null
		try {
			return JSON.parse(dataLine.slice(5).trim()) as JsonRpc
		} catch {
			return null
		}
	}
	try {
		return JSON.parse(raw) as JsonRpc
	} catch {
		return null
	}
}

async function rpc(server: McpServer, method: string, params?: unknown) {
	const res = await mcpCall({
		url: server.url,
		authHeader: server.authHeader,
		sessionId: server.sessionId,
		payload: { jsonrpc: "2.0", id: Date.now() % 1_000_000, method, params: params ?? {} },
	})
	if (!res.ok) return { ok: false as const, error: res.error, sessionId: server.sessionId }
	const body = parseMcpBody(res.jsonText, res.contentType)
	if (body?.error)
		return {
			ok: false as const,
			error: body.error.message ?? "MCP error",
			sessionId: res.sessionId,
		}
	return { ok: true as const, result: body?.result, sessionId: res.sessionId }
}

export async function handshakeMcp(server: McpServer): Promise<{ server: McpServer; error?: string }> {
	const init = await rpc(server, "initialize", {
		protocolVersion: "2025-03-26",
		capabilities: { tools: {} },
		clientInfo: { name: "moya", version: "0.1.0" },
	})
	if (!init.ok) return { server: { ...server, lastError: init.error }, error: init.error }
	const next = {
		...server,
		sessionId: init.sessionId,
		lastError: undefined,
		lastOkAt: new Date().toISOString(),
	}
	void rpc(next, "notifications/initialized")
	const listed = await rpc(next, "tools/list", {})
	if (!listed.ok) return { server: { ...next, lastError: listed.error }, error: listed.error }
	const tools = (
		(
			listed.result as
				| {
						tools?: { name: string; description?: string; inputSchema?: Record<string, unknown> }[]
				  }
				| undefined
		)?.tools ?? []
	).map(
		(t): McpTool => ({
			name: t.name,
			description: t.description ?? "",
			inputSchema: t.inputSchema,
			serverId: server.id,
		}),
	)
	return { server: { ...next, tools, lastError: undefined, lastOkAt: new Date().toISOString() } }
}

export async function callMcpTool(server: McpServer, name: string, args: unknown): Promise<string> {
	const res = await rpc(server, "tools/call", { name, arguments: args ?? {} })
	if (!res.ok) return `MCP error: ${res.error}`
	const result = res.result as { content?: { type?: string; text?: string }[]; isError?: boolean } | undefined
	if (!result) return "Empty MCP result."
	const text = (result.content ?? [])
		.map((c) => c.text ?? "")
		.filter(Boolean)
		.join("\n")
	return text || JSON.stringify(result).slice(0, 2000)
}
