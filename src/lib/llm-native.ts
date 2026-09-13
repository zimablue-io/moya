import { setOnDeviceLlmAvailable } from "./host.ts"
import type { ChatOk, ChatRequest, ChatResponse, ProviderModels } from "./llm.ts"
import { speechFromMessage } from "./llm-thinking.ts"

export type LlmStatus = {
	available: boolean
	ready: boolean
	backend: string
	loaded: string | null
	ramHint: number
	canPick?: boolean
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

export async function llmPick(): Promise<string | null> {
	const { invoke } = await core()
	return invoke<string | null>("llm_pick")
}

export function ggufDisplayName(path: string): string {
	const trimmed = path.trim()
	const parts = trimmed.split(/[/\\]/)
	return parts[parts.length - 1] || trimmed
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

/** Drop Metal/Vulkan weights when Model is no longer on-device. */
export async function releaseOnDeviceEngineIfUnused(providerId: string): Promise<void> {
	if (providerId === "ondevice") return
	try {
		await llmUnload()
	} catch {
		/* web tests / missing invoke */
	}
}

let watchingLifetime = false

/** Hide-to-tray is handled in Rust. This covers webview teardown on Quit. */
export function watchOnDeviceEngineLifetime(): void {
	if (watchingLifetime || typeof window === "undefined") return
	watchingLifetime = true
	const release = () => {
		void llmUnload().catch(() => {})
	}
	window.addEventListener("pagehide", release)
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

/** Tauri 2 invoke failures are often a `{ message }` object, not `Error`. */
export function nativeInvokeError(err: unknown): string {
	if (err instanceof Error && err.message.trim()) return err.message
	if (typeof err === "string" && err.trim()) return err
	if (err && typeof err === "object") {
		const rec = err as Record<string, unknown>
		if (typeof rec.message === "string" && rec.message.trim()) return rec.message
		if (typeof rec.error === "string" && rec.error.trim()) return rec.error
	}
	try {
		const dumped = JSON.stringify(err)
		if (dumped && dumped !== "{}" && dumped !== "null") return dumped
	} catch {
		/* ignore */
	}
	return "On-device model failed."
}

export async function completeNativeTurn(data: ChatRequest): Promise<ChatResponse> {
	const model = data.provider.model.trim()
	if (!model) return { ok: false, error: "Pick a GGUF in Settings." }
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
				error: result.error?.trim() || "On-device model failed.",
			}
		}
		const split = speechFromMessage({ content: result.content ?? "" })
		const ok: ChatOk = {
			ok: true,
			content: split.content,
			toolCalls: result.toolCalls ?? [],
		}
		if (split.thinking) ok.thinking = split.thinking
		return ok
	} catch (err) {
		return {
			ok: false,
			error: nativeInvokeError(err),
		}
	}
}
