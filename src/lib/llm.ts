import { completeHttpTurn, listHttpModels } from "./llm-http.ts"
import { completeNativeTurn, listNativeModels } from "./llm-native.ts"
import type { ProviderConfig, ProviderId } from "./types.ts"

export type ChatMessage = {
	role: "system" | "user" | "assistant" | "tool"
	content: string
	name?: string
	tool_call_id?: string
	tool_calls?: {
		id: string
		type: "function"
		function: { name: string; arguments: string }
	}[]
}

export type ChatTool = {
	type: "function"
	function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type ChatRequest = {
	provider: ProviderConfig
	messages: ChatMessage[]
	tools: ChatTool[]
}

export type ChatOk = {
	ok: true
	content: string
	toolCalls: { id: string; name: string; arguments: string }[]
}

export type ChatErr = { ok: false; error: string }
export type ChatResponse = ChatOk | ChatErr

export type ProviderModels = { ok: true; models: string[] } | { ok: false; error: string }

export function completeTurnMode(id: ProviderId | string): "native" | "http" {
	return id === "ondevice" ? "native" : "http"
}

export async function listProviderModels(provider: ProviderConfig): Promise<ProviderModels> {
	if (completeTurnMode(provider.id) === "native") return listNativeModels()
	return listHttpModels(provider)
}

export async function completeTurn(data: ChatRequest): Promise<ChatResponse> {
	if (completeTurnMode(data.provider.id) === "native") return completeNativeTurn(data)
	return completeHttpTurn(data)
}

export type McpProxyInput = {
	url: string
	authHeader: string
	sessionId?: string
	payload: Record<string, unknown>
}

export async function mcpCall(data: McpProxyInput) {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Accept: "application/json, text/event-stream",
	}
	if (data.authHeader) headers.Authorization = data.authHeader
	if (data.sessionId) headers["Mcp-Session-Id"] = data.sessionId

	let res: Response
	try {
		res = await fetch(data.url, {
			method: "POST",
			headers,
			body: JSON.stringify(data.payload),
		})
	} catch (err) {
		return {
			ok: false as const,
			error: err instanceof Error ? err.message : "Could not reach the MCP server.",
		}
	}

	const sessionId = res.headers.get("mcp-session-id") ?? data.sessionId ?? ""
	const ctype = res.headers.get("content-type") ?? ""
	const raw = await res.text()
	if (!res.ok) {
		return { ok: false as const, error: `MCP ${res.status}: ${raw.slice(0, 240)}` }
	}
	return { ok: true as const, sessionId, jsonText: raw, contentType: ctype }
}
