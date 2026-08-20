import { setOnDeviceLlmAvailable } from "./host.ts"
import type { ChatRequest, ChatResponse, ProviderModels } from "./llm.ts"

export type LlmStatus = {
	available: boolean
	ready: boolean
	backend: string
	loaded: string | null
	ramHint: number
}

export type LlmFile = {
	name: string
	bytes: number
}

export type LlmDownloadProgress = {
	filename: string
	received: number
	total: number
}

type NativeComplete = {
	ok: boolean
	content?: string
	toolCalls?: { id: string; name: string; arguments: string }[]
	error?: string
}

async function core() {
	return import("@tauri-apps/api/core")
}

export async function llmStatus(): Promise<LlmStatus> {
	const { invoke } = await core()
	const status = await invoke<LlmStatus>("llm_status")
	setOnDeviceLlmAvailable(Boolean(status.available))
	return status
}

export async function llmList(): Promise<LlmFile[]> {
	const { invoke } = await core()
	return invoke<LlmFile[]>("llm_list")
}

export async function llmDownload(url: string, filename: string): Promise<LlmFile> {
	const { invoke } = await core()
	return invoke<LlmFile>("llm_download", { url, filename })
}

export async function llmLoad(filename: string): Promise<LlmStatus> {
	const { invoke } = await core()
	return invoke<LlmStatus>("llm_load", { filename })
}

export async function llmUnload(): Promise<LlmStatus> {
	const { invoke } = await core()
	return invoke<LlmStatus>("llm_unload")
}

export async function onLlmDownloadProgress(handler: (progress: LlmDownloadProgress) => void): Promise<() => void> {
	const { listen } = await import("@tauri-apps/api/event")
	const unlisten = await listen<LlmDownloadProgress>("llm-download-progress", (event) => {
		handler(event.payload)
	})
	return unlisten
}

export async function listNativeModels(): Promise<ProviderModels> {
	try {
		const files = await llmList()
		return { ok: true, models: files.map((f) => f.name) }
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Could not list GGUF files.",
		}
	}
}

export async function completeNativeTurn(data: ChatRequest): Promise<ChatResponse> {
	const model = data.provider.model.trim()
	if (!model) return { ok: false, error: "Download or pick a GGUF in Settings." }
	try {
		const { invoke } = await core()
		const result = await invoke<NativeComplete>("llm_complete", {
			messages: data.messages,
			tools: data.tools,
			maxTokens: 900,
			temperature: 0.6,
			filename: model,
		})
		if (!result.ok) {
			return {
				ok: false,
				error: `${result.error ?? "On-device model failed."} Switch to Grok in Settings for a cloud model.`,
			}
		}
		return {
			ok: true,
			content: result.content ?? "",
			toolCalls: result.toolCalls ?? [],
		}
	} catch (err) {
		return {
			ok: false,
			error: `${err instanceof Error ? err.message : "On-device model failed."} Switch to Grok in Settings for a cloud model.`,
		}
	}
}
