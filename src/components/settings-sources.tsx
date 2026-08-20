import { Calendar, CalendarDays, CalendarRange, Github, Hexagon, Paperclip } from "lucide-react"
import { type ComponentType, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
	connectArgsFromPreset,
	connectedCount,
	SOURCE_CATALOG,
	SOURCE_PRESETS,
	type SourcePresetId,
} from "@/lib/source-contract"
import { cn } from "@/lib/utils"

const PRESET_ICON: Record<SourcePresetId, ComponentType<{ className?: string }>> = {
	"google-calendar": Calendar,
	"apple-calendar": CalendarDays,
	"outlook-calendar": CalendarRange,
	linear: Hexagon,
	github: Github,
	attach: Paperclip,
}

export function SourcesPanel({
	sources,
	onAttach,
	onConnect,
	onRemove,
	onSync,
}: {
	sources: {
		id: string
		kind: string
		name: string
		origin: string
		lastSyncAt: string | null
		files: unknown[]
		events: unknown[]
		work: unknown[]
	}[]
	onAttach: (name: string, files: { name: string; text: string }[]) => void
	onConnect: (kind: "calendar" | "work", name: string, origin: string, authHeader?: string) => Promise<void>
	onRemove: (id: string) => void
	onSync: (id: string) => Promise<void>
}) {
	const [draftId, setDraftId] = useState<SourcePresetId | null>(null)
	const [name, setName] = useState("")
	const [origin, setOrigin] = useState("")
	const [auth, setAuth] = useState("")

	const draft = draftId ? SOURCE_PRESETS[draftId] : null

	const openPreset = (id: SourcePresetId) => {
		const preset = SOURCE_PRESETS[id]
		setDraftId(id)
		setName(preset.defaultName)
		setOrigin(preset.defaultOrigin)
		setAuth("")
	}

	const resetDraft = () => {
		setDraftId(null)
		setName("")
		setOrigin("")
		setAuth("")
	}

	const submitConnect = () => {
		if (!draftId) return
		const args = connectArgsFromPreset(draftId, { name, origin, authHeader: auth })
		if (args.action !== "connect") return
		void onConnect(args.kind, args.name, args.origin, args.authHeader || undefined)
		resetDraft()
	}

	const submitAttach = () => {
		if (!draftId) return
		const args = connectArgsFromPreset(draftId, { name, origin: "" })
		if (args.action !== "attach") return
		const input = document.createElement("input")
		input.type = "file"
		input.multiple = true
		input.onchange = async () => {
			const files = input.files
			if (!files?.length) return
			const copied: { name: string; text: string }[] = []
			for (const file of files) {
				copied.push({ name: file.name, text: await file.text() })
			}
			onAttach(args.name.trim() || copied[0]?.name || SOURCE_PRESETS.attach.defaultName, copied)
			resetDraft()
		}
		input.click()
	}

	const canConnect = draft
		? (!draft.needsOrigin || origin.trim().length > 0) && (!draft.needsAuth || auth.trim().length > 0)
		: false

	return (
		<TooltipProvider delay={400}>
			<div className="flex flex-col gap-4">
				<p className="text-sm text-muted-foreground">
					Read-only. Each tile adds another connection. Removing a source deletes Moya&apos;s copy only — never your
					files.
				</p>
				<div className="grid grid-cols-3 gap-2">
					{SOURCE_CATALOG.map((id) => {
						const preset = SOURCE_PRESETS[id]
						const Icon = PRESET_ICON[id]
						const count = connectedCount(sources, id)
						const selected = draftId === id
						return (
							<Tooltip key={id}>
								<TooltipTrigger
									render={
										<button
											type="button"
											aria-pressed={selected}
											className={cn(
												"relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl bg-surface-2 px-2 py-3 text-fg ring-2 ring-transparent outline-none",
												"hover:bg-surface focus-visible:ring-ring/50",
												selected && "ring-ring",
											)}
											onClick={() => openPreset(id)}
										/>
									}
								>
									<span className="absolute top-1.5 right-1.5 grid size-5 place-items-center">
										{count > 0 ? <span className="type-chip text-[0.65rem] text-ok">{count}</span> : null}
									</span>
									<Icon className="size-5 shrink-0 text-fg" />
									<span className="w-full truncate text-center text-xs font-medium">{preset.label}</span>
								</TooltipTrigger>
								<TooltipContent>{preset.hint}</TooltipContent>
							</Tooltip>
						)
					})}
				</div>
				{draft ? (
					<div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
						<p className="text-xs text-muted-foreground">{draft.hint}</p>
						<Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
						{draft.needsOrigin ? (
							<Input placeholder={draft.originPlaceholder} value={origin} onChange={(e) => setOrigin(e.target.value)} />
						) : null}
						{draft.needsAuth ? (
							<Input
								type="password"
								autoComplete="off"
								placeholder={draft.authPlaceholder}
								value={auth}
								onChange={(e) => setAuth(e.target.value)}
							/>
						) : null}
						<div className="flex flex-wrap gap-2">
							{draft.kind === "attach" ? (
								<Button variant="outline" onClick={submitAttach}>
									Attach files
								</Button>
							) : (
								<Button variant="outline" disabled={!canConnect} onClick={submitConnect}>
									Connect
								</Button>
							)}
							<Button variant="ghost" onClick={resetDraft}>
								Cancel
							</Button>
						</div>
					</div>
				) : null}
				<ul className="flex flex-col gap-2">
					{sources.length === 0 ? (
						<li className="text-sm text-muted-foreground">
							No sources yet. Lived data on this device is always readable.
						</li>
					) : (
						sources.map((s) => (
							<li key={s.id} className="rounded-xl bg-surface-2 p-3">
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-sm font-medium text-fg">{s.name}</p>
										<p className="text-xs text-muted-foreground">
											{s.kind} · read · {s.origin}
										</p>
										<p className="mt-1 text-xs text-subtle">
											{s.kind === "brought"
												? `${s.files.length} file${s.files.length === 1 ? "" : "s"}`
												: s.kind === "calendar"
													? `${s.events.length} events`
													: `${s.work.length} items`}
											{s.lastSyncAt ? ` · synced` : ""}
										</p>
									</div>
									<div className="flex items-center gap-2">
										{s.kind !== "brought" ? (
											<Button size="sm" variant="outline" onClick={() => void onSync(s.id)}>
												Sync
											</Button>
										) : null}
										<Button size="sm" variant="ghost" onClick={() => onRemove(s.id)}>
											Remove
										</Button>
									</div>
								</div>
							</li>
						))
					)}
				</ul>
			</div>
		</TooltipProvider>
	)
}
