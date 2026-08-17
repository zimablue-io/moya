import { Trash2 } from "lucide-react"
import { ArtifactView } from "@/components/artifact-view"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { APP_NAME } from "@/lib/brand"
import type { WatchTab } from "@/lib/environment/types"
import { useApp } from "@/lib/store"
import { localDayKey } from "@/lib/transcript"
import { formatWhen, hoursBetween } from "@/lib/utils"

export function WatchDialog() {
	const dialog = useApp((s) => s.dialog)
	const openDialog = useApp((s) => s.openDialog)
	const inbox = useApp((s) => s.inbox)
	const boards = useApp((s) => s.boards)
	const timeLogs = useApp((s) => s.timeLogs)
	const insights = useApp((s) => s.insights)
	const sources = useApp((s) => s.sources)
	const resolveInbox = useApp((s) => s.resolveInbox)
	const deleteBoard = useApp((s) => s.deleteBoard)
	const watchTab = useApp((s) => s.watchTab)
	const setWatchTab = useApp((s) => s.setWatchTab)

	const open = inbox.filter((i) => !i.resolvedAt)
	const work = (sources ?? []).filter((s) => s.kind === "work")
	const workItems = work.flatMap((s) => s.work.map((w) => ({ ...w, source: s.name })))
	const calendar = (sources ?? []).filter((s) => s.kind === "calendar" || s.events.length > 0)
	const today = localDayKey(new Date().toISOString())
	const todayEvents = calendar.flatMap((s) =>
		s.events.filter((e) => localDayKey(e.start) === today).map((e) => ({ ...e, source: s.name })),
	)
	const byCat = timeLogs.reduce<Record<string, number>>((acc, t) => {
		acc[t.category] = (acc[t.category] ?? 0) + hoursBetween(t.startedAt, t.endedAt)
		return acc
	}, {})
	const chart =
		Object.keys(byCat).length > 0
			? {
					type: "chart" as const,
					title: "Logged hours",
					series: [
						{
							name: "hours",
							points: Object.entries(byCat).map(([x, y]) => ({ x, y: Number(y.toFixed(2)) })),
						},
					],
				}
			: null

	return (
		<Dialog open={dialog === "watch"} onOpenChange={(o) => openDialog(o ? "watch" : null)}>
			<DialogContent className="grid-rows-[auto_1fr] sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Watch</DialogTitle>
					<DialogDescription>Needs you, boards, and how time is moving.</DialogDescription>
				</DialogHeader>
				<Tabs value={watchTab} onValueChange={(v) => setWatchTab(v as WatchTab)} className="min-h-0">
					<TabsList>
						<TabsTrigger value="inbox">Needs you {open.length ? `(${open.length})` : ""}</TabsTrigger>
						<TabsTrigger value="boards">Boards</TabsTrigger>
						<TabsTrigger value="time">Time</TabsTrigger>
					</TabsList>
					<ScrollArea className="h-[min(52dvh,28rem)] pr-2">
						<TabsContent value="inbox" className="mt-0">
							{open.length === 0 ? (
								<p className="py-10 text-center text-sm text-muted">Nothing waiting.</p>
							) : (
								<ul className="flex flex-col gap-2">
									{open.map((item) => (
										<li key={item.id} className="rounded-xl bg-surface-2 p-3">
											<div className="flex items-start justify-between gap-3">
												<div>
													<div className="flex items-center gap-2">
														<Badge
															variant={
																item.severity === "urgent" ? "urgent" : item.severity === "need" ? "need" : "default"
															}
														>
															{item.severity}
														</Badge>
														<h3 className="text-sm font-medium text-fg">{item.title}</h3>
													</div>
													<p className="mt-1 text-sm text-muted">{item.body}</p>
													<p className="type-time mt-2 text-subtle">
														{item.source} · {formatWhen(item.createdAt)}
													</p>
												</div>
												<Button size="sm" variant="outline" onClick={() => resolveInbox(item.id)}>
													Clear
												</Button>
											</div>
										</li>
									))}
								</ul>
							)}
						</TabsContent>
						<TabsContent value="boards" className="mt-0">
							{boards.length === 0 && workItems.length === 0 ? (
								<p className="py-10 text-center text-sm text-muted">
									No projects yet. Connect Linear readonly or GitHub read in Settings → Sources, or ask {APP_NAME} to
									start a board.
								</p>
							) : (
								<div className="flex flex-col gap-3">
									{workItems.length ? (
										<ul className="flex flex-col gap-2">
											{workItems.map((w) => (
												<li key={`${w.source}-${w.id}`} className="rounded-xl bg-surface-2 p-3">
													<p className="text-sm font-medium text-fg">{w.title}</p>
													<p className="mt-1 text-xs text-muted">
														{w.source} · {w.state}
													</p>
												</li>
											))}
										</ul>
									) : null}
									{boards.length === 0 ? null : (
										<ul className="flex flex-col gap-3">
											{boards.map((b) => (
												<li key={b.id} className="rounded-xl bg-surface-2 p-3">
													<div className="flex items-start justify-between gap-2">
														<div>
															<h3 className="text-sm font-medium text-fg">{b.name}</h3>
															<p className="mt-1 text-sm text-muted">{b.summary}</p>
														</div>
														<Button
															size="icon"
															variant="ghost"
															aria-label={`Delete ${b.name}`}
															onClick={() => deleteBoard(b.id)}
														>
															<Trash2 className="size-4 text-muted" />
														</Button>
													</div>
													<ul className="mt-3 flex flex-col gap-1.5">
														{(b.items ?? []).map((it) => (
															<li key={it.id} className="flex items-baseline justify-between gap-3 text-sm">
																<span className="text-fg">{it.label}</span>
																<span className={it.needsInput ? "text-warn" : "text-muted"}>
																	{it.state}
																	{it.needsInput ? " · needs you" : ""}
																</span>
															</li>
														))}
													</ul>
												</li>
											))}
										</ul>
									)}
								</div>
							)}
						</TabsContent>
						<TabsContent value="time" className="mt-0 space-y-4">
							{calendar.length === 0 ? (
								<p className="text-sm text-muted">No calendar source. Add an ICS feed in Settings → Sources.</p>
							) : todayEvents.length === 0 ? (
								<p className="text-sm text-muted">Calendar is connected. Nothing on today.</p>
							) : (
								<ul className="flex flex-col gap-2">
									{todayEvents.map((e) => (
										<li key={e.id} className="rounded-xl bg-surface-2 p-3">
											<p className="text-sm font-medium text-fg">{e.title}</p>
											<p className="mt-1 text-xs text-muted">
												{e.source} · {formatWhen(e.start)}
											</p>
										</li>
									))}
								</ul>
							)}
							{chart ? <ArtifactView artifact={chart} /> : <p className="text-sm text-muted">No time logged yet.</p>}
							<ul className="flex flex-col gap-2">
								{timeLogs.slice(0, 20).map((t) => (
									<li key={t.id} className="flex items-baseline justify-between gap-3 text-sm">
										<span className="text-fg">
											{hoursBetween(t.startedAt, t.endedAt).toFixed(1)}h {t.category}
										</span>
										<span className="text-muted">{t.note || formatWhen(t.startedAt)}</span>
									</li>
								))}
							</ul>
							{insights[0] ? (
								<div className="rounded-xl bg-surface-2 p-3">
									<h3 className="text-sm font-medium text-fg">{insights[0].title}</h3>
									<p className="mt-1 whitespace-pre-wrap text-sm text-muted">{insights[0].body}</p>
								</div>
							) : null}
						</TabsContent>
					</ScrollArea>
				</Tabs>
			</DialogContent>
		</Dialog>
	)
}
