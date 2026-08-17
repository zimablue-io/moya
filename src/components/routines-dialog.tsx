import { Play, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { AUTOMATION_PRESETS, type AutomationDraft, formatTrigger } from "@/lib/automations"
import { useApp } from "@/lib/store"
import type { AutomationTrigger } from "@/lib/types"
import { formatWhen } from "@/lib/utils"

type TriggerKind = AutomationTrigger["type"]

export function RoutinesDialog() {
	const dialog = useApp((s) => s.dialog)
	const openDialog = useApp((s) => s.openDialog)
	const automations = useApp((s) => s.automations)
	const addAutomation = useApp((s) => s.addAutomation)
	const updateAutomation = useApp((s) => s.updateAutomation)
	const removeAutomation = useApp((s) => s.removeAutomation)
	const runAutomation = useApp((s) => s.runAutomation)
	const running = useApp((s) => s.runningAutomation)

	const [name, setName] = useState("")
	const [brief, setBrief] = useState("")
	const [kind, setKind] = useState<TriggerKind>("manual")
	const [minutes, setMinutes] = useState(60)
	const [time, setTime] = useState("08:00")
	const [pattern, setPattern] = useState("remember")
	const [openForm, setOpenForm] = useState(false)

	const triggerFromForm = (): AutomationTrigger => {
		if (kind === "interval") return { type: "interval", everyMinutes: Math.max(5, minutes) }
		if (kind === "daily") {
			const [h, m] = time.split(":").map(Number)
			return { type: "daily", hour: h || 8, minute: m || 0 }
		}
		if (kind === "phrase") return { type: "phrase", pattern: pattern.trim() || "remember" }
		return { type: "manual" }
	}

	const submit = (draft: AutomationDraft) => {
		addAutomation(draft)
		setName("")
		setBrief("")
		setOpenForm(false)
	}

	return (
		<Dialog open={dialog === "routines"} onOpenChange={(o) => openDialog(o ? "routines" : null)}>
			<DialogContent className="grid-rows-[auto_1fr_auto] sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Routines</DialogTitle>
					<DialogDescription>Things Moya does without being asked. They run on this device only.</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 pr-2">
					{automations.length === 0 && !openForm ? (
						<div className="flex flex-col gap-4 py-2">
							<p className="text-sm text-muted">Start with one of these, or write your own.</p>
							<ul className="flex flex-col gap-2">
								{AUTOMATION_PRESETS.map((p) => (
									<li key={p.name} className="flex items-start justify-between gap-3 rounded-xl bg-surface-2 p-3">
										<div>
											<h3 className="text-sm font-medium text-fg">{p.name}</h3>
											<p className="mt-1 text-xs text-muted">{formatTrigger(p.trigger)}</p>
											<p className="mt-2 text-sm text-fg/80">{p.brief}</p>
										</div>
										<Button size="sm" variant="outline" onClick={() => addAutomation(p)}>
											Add
										</Button>
									</li>
								))}
							</ul>
						</div>
					) : (
						<ul className="flex flex-col gap-2 pb-2">
							{automations.map((a) => (
								<li key={a.id} className="rounded-xl bg-surface-2 p-3">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="flex flex-wrap items-center gap-2">
												<h3 className="text-sm font-medium text-fg">{a.name}</h3>
												<Badge variant={a.enabled ? "ok" : "default"}>{formatTrigger(a.trigger)}</Badge>
												{running === a.id ? <span className="text-[11px] text-muted">Running</span> : null}
											</div>
											<p className="mt-1.5 text-sm leading-relaxed text-fg/80">{a.brief}</p>
											<p className="mt-2 text-[11px] text-subtle">
												{a.lastRunAt ? `Last ${formatWhen(a.lastRunAt)}` : "Not run yet"}
												{a.lastResult ? ` · ${a.lastResult.slice(0, 80)}` : ""}
											</p>
										</div>
										<div className="flex shrink-0 items-center gap-1">
											<Switch checked={a.enabled} onCheckedChange={(v) => updateAutomation(a.id, { enabled: v })} />
											<Button
												size="icon"
												variant="ghost"
												aria-label="Run now"
												disabled={Boolean(running)}
												onClick={() => void runAutomation(a.id, { speak: true })}
											>
												<Play className="size-4" />
											</Button>
											<Button size="icon" variant="ghost" aria-label="Remove" onClick={() => removeAutomation(a.id)}>
												<Trash2 className="size-4 text-muted" />
											</Button>
										</div>
									</div>
								</li>
							))}
						</ul>
					)}
				</ScrollArea>
				{openForm ? (
					<form
						className="flex flex-col gap-3 rounded-xl border border-border p-3"
						onSubmit={(e) => {
							e.preventDefault()
							if (!name.trim() || !brief.trim()) return
							submit({ name, brief, trigger: triggerFromForm(), enabled: true })
						}}
					>
						<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
						<Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What should Moya do?" />
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label>When</Label>
								<select
									value={kind}
									onChange={(e) => setKind(e.target.value as TriggerKind)}
									className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg"
								>
									<option value="manual">Manual</option>
									<option value="interval">On an interval</option>
									<option value="daily">Every day</option>
									<option value="phrase">When I say…</option>
								</select>
							</div>
							{kind === "interval" ? (
								<div className="space-y-1.5">
									<Label>Minutes</Label>
									<Input type="number" min={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
								</div>
							) : null}
							{kind === "daily" ? (
								<div className="space-y-1.5">
									<Label>Time</Label>
									<Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
								</div>
							) : null}
							{kind === "phrase" ? (
								<div className="space-y-1.5">
									<Label>Phrase</Label>
									<Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="remember" />
								</div>
							) : null}
						</div>
						<div className="flex justify-end gap-2">
							<Button type="button" variant="ghost" onClick={() => setOpenForm(false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={!name.trim() || !brief.trim()}>
								Save
							</Button>
						</div>
					</form>
				) : (
					<div className="flex justify-end">
						<Button variant="outline" onClick={() => setOpenForm(true)}>
							<Plus className="size-4" />
							New routine
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
