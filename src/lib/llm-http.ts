import type { ChatRequest, ChatResponse, ProviderModels } from "./llm.ts"
import { parseOpenAiModelIds, providerNeedsKey } from "./provider-models.ts"
import type { ProviderConfig, ProviderId } from "./types.ts"
import { PROVIDER_PRESETS } from "./types.ts"

export function resolveHttpEndpoint(
	provider: ProviderConfig,
): { url: string; key: string; model: string } | { error: string } {
	const preset = PROVIDER_PRESETS[provider.id as ProviderId]
	const base = provider.baseUrl.trim().replace(/\/+$/, "")
	const model = provider.model.trim()
	const key = provider.apiKey.trim()
	if (!preset) return { error: "Unknown provider." }
	if (!base) return { error: "No provider endpoint configured." }
	if (!model) return { error: "Set a model in Settings." }
	if (providerNeedsKey(provider.id) && !key) {
		return { error: `Add an API key for ${preset.label} in Settings.` }
	}
	return { url: `${base}/chat/completions`, key: key || "local", model }
}

export async function listHttpModels(provider: ProviderConfig): Promise<ProviderModels> {
	const preset = PROVIDER_PRESETS[provider.id as ProviderId]
	const base = provider.baseUrl.trim().replace(/\/+$/, "")
	const key = provider.apiKey.trim()
	if (!preset) return { ok: false, error: "Unknown provider." }
	if (!base) return { ok: false, error: "No provider endpoint configured." }
	if (providerNeedsKey(provider.id) && !key) {
		return { ok: false, error: `Add an API key for ${preset.label}.` }
	}
	const headers: Record<string, string> = {}
	if (key) headers.Authorization = `Bearer ${key}`
	try {
		const res = await fetch(`${base}/models`, {
			headers,
			signal: AbortSignal.timeout(8000),
		})
		if (!res.ok) {
			const text = await res.text().catch(() => "")
			return {
				ok: false,
				error: `Could not list models (${res.status})${text ? `: ${text.slice(0, 160)}` : ""}`,
			}
		}
		const models = parseOpenAiModelIds(await res.json())
		return { ok: true, models }
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Could not reach the provider.",
		}
	}
}

export async function completeHttpTurn(data: ChatRequest): Promise<ChatResponse> {
	const resolved = resolveHttpEndpoint(data.provider)
	if ("error" in resolved) return { ok: false, error: resolved.error }

	const body: Record<string, unknown> = {
		model: resolved.model,
		messages: data.messages,
		max_tokens: 900,
		temperature: 0.6,
	}
	if (data.tools.length) {
		body.tools = data.tools
		body.tool_choice = "auto"
	}

	const headers: Record<string, string> = { "Content-Type": "application/json" }
	if (resolved.key && resolved.key !== "local") headers.Authorization = `Bearer ${resolved.key}`

	let res: Response
	try {
		res = await fetch(resolved.url, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		})
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Network error talking to the model.",
		}
	}

	if (!res.ok) {
		const text = await res.text().catch(() => "")
		return {
			ok: false,
			error: `Model error ${res.status}${text ? `: ${text.slice(0, 240)}` : ""}`,
		}
	}

	const json = (await res.json()) as {
		choices?: {
			message?: {
				content?: string | null
				tool_calls?: { id: string; function: { name: string; arguments: string } }[]
			}
		}[]
	}
	const msg = json.choices?.[0]?.message
	const toolCalls =
		msg?.tool_calls?.map((c) => ({
			id: c.id,
			name: c.function.name,
			arguments: c.function.arguments ?? "{}",
		})) ?? []
	return { ok: true, content: msg?.content ?? "", toolCalls }
}
