import { useEffect, useState } from "react"
import { Field } from "@/components/settings-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { GGUF_SUGGESTIONS } from "@/lib/gguf-catalog"
import { hostCaps, thisDeviceLabel } from "@/lib/host"
import {
	ggufDisplayName,
	type LlmDownloadProgress,
	type LlmFile,
	type LlmStatus,
	llmDownload,
	llmList,
	llmLoad,
	llmPick,
	llmStatus,
	onLlmDownloadProgress,
} from "@/lib/llm-native"
import { useApp } from "@/lib/store"

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function OnDeviceModels({ model, onPicked }: { model: string; onPicked?: (filename: string) => void }) {
	const dispatch = useApp((s) => s.dispatch)
	const [status, setStatus] = useState<LlmStatus | null>(null)
	const [files, setFiles] = useState<LlmFile[]>([])
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState<string | null>(null)
	const [progress, setProgress] = useState<LlmDownloadProgress | null>(null)
	const [customUrl, setCustomUrl] = useState("")
	const caps = hostCaps()
	const pickFromDisk = Boolean(status?.canPick ?? caps.pickGgufFromDisk)
	const device = thisDeviceLabel()

	const refresh = async () => {
		try {
			const next = await llmStatus()
			setStatus(next)
			setFiles(await llmList())
			setError(null)
		} catch (err) {
			setError(err instanceof Error ? err.message : "On-device runtime is not available.")
		}
	}

	useEffect(() => {
		let cancelled = false
		void (async () => {
			try {
				const next = await llmStatus()
				if (cancelled) return
				setStatus(next)
				setFiles(await llmList())
				setError(null)
			} catch (err) {
				if (!cancelled) setError(err instanceof Error ? err.message : "On-device runtime is not available.")
			}
		})()
		let stop: (() => void) | undefined
		void onLlmDownloadProgress(setProgress).then((unlisten) => {
			stop = unlisten
		})
		return () => {
			cancelled = true
			stop?.()
		}
	}, [])

	const choose = async (filename: string) => {
		setBusy("load")
		try {
			await llmLoad(filename)
			await dispatch("settings.provider", { field: "model", value: filename })
			onPicked?.(filename)
			await refresh()
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not load that GGUF.")
		} finally {
			setBusy(null)
		}
	}

	const openFromDisk = async () => {
		setBusy("pick")
		try {
			const path = await llmPick()
			if (path) await choose(path)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not open that GGUF.")
		} finally {
			setBusy(null)
		}
	}

	const download = async (url: string, filename: string) => {
		setBusy(filename)
		setProgress({ filename, received: 0, total: 0 })
		try {
			await llmDownload(url, filename)
			await choose(filename)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Download failed.")
		} finally {
			setBusy(null)
			setProgress(null)
		}
	}

	const ram = status?.ramHint ?? 0
	const suggestions = GGUF_SUGGESTIONS
	const largeOk = ram >= 6144
	const options = files.map((f) => f.name)
	if (model && !options.includes(model)) options.unshift(model)
	const selected = options.includes(model) ? model : ""
	const loadedLabel = status?.loaded ? ggufDisplayName(status.loaded) : null

	return (
		<div className="flex flex-col gap-4">
			<p className={error ? "text-xs text-alert" : "text-xs text-muted-foreground"}>
				{error
					? error
					: status
						? status.available
							? `${status.backend}${loadedLabel ? ` · ${loadedLabel}` : " · no GGUF loaded"}${ram ? ` · ~${Math.round(ram / 1024)} GB RAM` : ""}`
							: "On-device llama.cpp is not available on this device."
						: "Checking on-device runtime…"}
			</p>
			{largeOk ? (
				<p className="text-xs text-muted-foreground">This device has enough RAM for a larger GGUF.</p>
			) : ram > 0 ? (
				<p className="text-xs text-muted-foreground">Stay with a 1–2B Q4 unless you know the device can hold more.</p>
			) : null}
			{progress ? (
				<p className="text-xs text-muted-foreground">
					Downloading {progress.filename}
					{progress.total
						? ` · ${formatBytes(progress.received)} / ${formatBytes(progress.total)}`
						: progress.received
							? ` · ${formatBytes(progress.received)}`
							: "…"}
				</p>
			) : null}
			{pickFromDisk ? (
				<Button type="button" disabled={busy !== null} onClick={() => void openFromDisk()}>
					{busy === "pick" || busy === "load" ? "Opening…" : `Open a GGUF on ${device}`}
				</Button>
			) : null}
			<label className="grid gap-2">
				<span className="text-sm font-medium">{pickFromDisk ? `GGUFs on ${device}` : "GGUF on this device"}</span>
				<Select
					items={[
						{
							value: "",
							label: files.length ? "Choose a GGUF" : pickFromDisk ? "None listed yet" : "No GGUF downloaded yet",
						},
						...options.map((name) => ({ value: name, label: ggufDisplayName(name) })),
					]}
					value={selected}
					disabled={options.length === 0 || busy !== null}
					onValueChange={(v) => {
						if (v) void choose(v)
					}}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="">
							{files.length ? "Choose a GGUF" : pickFromDisk ? "None listed yet" : "No GGUF downloaded yet"}
						</SelectItem>
						{options.map((name) => {
							const file = files.find((f) => f.name === name)
							return (
								<SelectItem key={name} value={name}>
									{ggufDisplayName(name)}
									{file ? ` (${formatBytes(file.bytes)})` : ""}
								</SelectItem>
							)
						})}
					</SelectContent>
				</Select>
			</label>
			<div className="flex flex-col gap-2">
				<p className="text-xs text-muted-foreground">Or download a suggested file.</p>
				{suggestions.map((item) => (
					<Button
						key={item.id}
						type="button"
						variant="outline"
						disabled={busy !== null}
						onClick={() => void download(item.url, item.filename)}
					>
						{busy === item.filename ? "Downloading…" : `Download ${item.label}`}
						<span className="ml-2 text-xs text-muted-foreground">
							{item.sizeLabel} · {item.note}
						</span>
					</Button>
				))}
			</div>
			<Field label="Or download a GGUF URL">
				<div className="flex flex-col gap-2">
					<Input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://…/model.gguf" />
					<Button
						type="button"
						variant="outline"
						disabled={busy !== null || !customUrl.trim().endsWith(".gguf")}
						onClick={() => {
							const url = customUrl.trim()
							const filename = url.split("/").pop() ?? "model.gguf"
							void download(url, filename)
						}}
					>
						Download URL
					</Button>
				</div>
			</Field>
		</div>
	)
}
