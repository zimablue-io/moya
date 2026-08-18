import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
	const [name, setName] = useState("")
	const [origin, setOrigin] = useState("")
	const [auth, setAuth] = useState("")
	const [kind, setKind] = useState<"calendar" | "work">("calendar")

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				Read-only. Calendar is an ICS feed or file. Work is Linear readonly or GitHub read. Attach copies notes into
				Moya. Removing a source deletes Moya&apos;s copy only — never your files.
			</p>
			<div className="grid gap-2">
				<Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
				<Select
					items={[
						{ value: "calendar", label: "Calendar (ICS)" },
						{ value: "work", label: "Work (Linear / GitHub)" },
					]}
					value={kind}
					onValueChange={(v) => {
						if (v === "calendar" || v === "work") setKind(v)
					}}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="calendar">Calendar (ICS)</SelectItem>
						<SelectItem value="work">Work (Linear / GitHub)</SelectItem>
					</SelectContent>
				</Select>
				<Input
					placeholder={kind === "calendar" ? "https://…/calendar.ics" : "https://api.linear.app or GitHub issues URL"}
					value={origin}
					onChange={(e) => setOrigin(e.target.value)}
				/>
				<Input
					placeholder="Token or Authorization header (optional)"
					value={auth}
					onChange={(e) => setAuth(e.target.value)}
				/>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						disabled={!name.trim() || !origin.trim()}
						onClick={() => {
							void onConnect(kind, name.trim(), origin.trim(), auth.trim() || undefined)
							setName("")
							setOrigin("")
							setAuth("")
						}}
					>
						Connect
					</Button>
					<Button
						variant="outline"
						onClick={() => {
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
								onAttach(name.trim() || copied[0]?.name || "Attached", copied)
								setName("")
							}
							input.click()
						}}
					>
						Attach files
					</Button>
				</div>
			</div>
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
	)
}
