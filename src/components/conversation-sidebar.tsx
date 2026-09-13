import { useEffect } from "react"
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
	useMessageScroller,
} from "@/components/ui/message-scroller"
import { speakerLabel } from "@/lib/brand"
import { useApp } from "@/lib/store"
import { isTranscriptTurn } from "@/lib/transcript"
import { cn } from "@/lib/utils"

function JumpToLatestWhenOpen() {
	const open = useApp((s) => s.conversationOpen)
	const { scrollToEnd } = useMessageScroller()
	useEffect(() => {
		if (!open) return
		scrollToEnd({ behavior: "auto" })
	}, [open, scrollToEnd])
	return null
}

export function ConversationSidebar() {
	const messages = useApp((s) => s.messages)
	const agentName = useApp((s) => s.settings.agentName)
	const conversationOpen = useApp((s) => s.conversationOpen)
	const turns = messages.filter(isTranscriptTurn)

	return (
		<aside
			aria-hidden={!conversationOpen}
			inert={!conversationOpen}
			className={cn(
				"absolute top-20 right-3 bottom-28 z-40 flex w-[min(20rem,calc(100vw-5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface/95 p-4 shadow-xl backdrop-blur-md transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
				conversationOpen
					? "pointer-events-auto translate-x-0 opacity-100"
					: "pointer-events-none translate-x-[calc(100%+1.5rem)] opacity-0",
			)}
		>
			<p className="type-display flex h-11 shrink-0 items-center text-lg text-fg">Conversation</p>
			<MessageScrollerProvider autoScroll defaultScrollPosition="end">
				<JumpToLatestWhenOpen />
				<MessageScroller className="min-h-0 flex-1">
					<MessageScrollerViewport>
						<MessageScrollerContent className="gap-4 py-3" role="list">
							{turns.length === 0 ? (
								<MessageScrollerItem>
									<p className="py-10 text-center text-sm text-muted-foreground">No turns yet.</p>
								</MessageScrollerItem>
							) : (
								turns.map((m) => (
									<MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={m.role === "user"} role="listitem">
										<p className="type-chip text-muted-foreground">{speakerLabel(m.role, agentName)}</p>
										<p className={cn("text-sm leading-relaxed", m.role === "user" ? "text-fg" : "text-fg/85")}>
											{m.content}
										</p>
										{m.thinking ? (
											<details>
												<summary className="type-chip cursor-pointer text-muted-foreground">Thought</summary>
												<p className="mt-1 text-sm leading-relaxed text-subtle">{m.thinking}</p>
											</details>
										) : null}
									</MessageScrollerItem>
								))
							)}
						</MessageScrollerContent>
					</MessageScrollerViewport>
					<MessageScrollerButton aria-label="Scroll to bottom" />
				</MessageScroller>
			</MessageScrollerProvider>
		</aside>
	)
}
