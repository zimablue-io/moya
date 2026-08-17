import { Brain, History, Keyboard, LayoutGrid, MessageSquare, Radio, Repeat, Settings, X } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { ArtifactDialog } from "@/components/artifact-dialog"
import { Composer } from "@/components/composer"
import { HistoryDialog } from "@/components/history-dialog"
import { MemoryDialog } from "@/components/memory-dialog"
import { PresenceCanvas } from "@/components/presence-canvas"
import { RoutinesDialog } from "@/components/routines-dialog"
import { SettingsDialog } from "@/components/settings-dialog"
import { WatchDialog } from "@/components/watch-dialog"
import { displayName } from "@/lib/brand"
import { systemSettingsLabel } from "@/lib/host"
import { allowMicrophone } from "@/lib/media-permission"
import { displayVoiceCaption } from "@/lib/realtime-protocol"
import { speech } from "@/lib/speech"
import { pendingInboxCount, useApp } from "@/lib/store"
import { type DialogId } from "@/lib/types"
import { cn, formatClock } from "@/lib/utils"
import { browserSpeechFinalSink, shouldExitVoiceForComposer, shouldStartHoldListen } from "@/lib/voice-contract"
import { enterVoiceMode, exitVoiceMode, restartVoiceIfNeeded } from "@/lib/voice-mode"

const TOOLS: {
	id: Exclude<DialogId, "artifact" | null>
	label: string
	hint: string
	icon: typeof Brain
}[] = [
	{ id: "history", label: "Transcript", hint: "Every word", icon: History },
	{ id: "memory", label: "Memory", hint: "What stays", icon: Brain },
	{ id: "routines", label: "Routines", hint: "What runs", icon: Repeat },
	{ id: "watch", label: "Watch", hint: "Needs you", icon: MessageSquare },
	{ id: "settings", label: "Settings", hint: "Name, voice, model", icon: Settings },
]

export function AssistantShell() {
	const hydrate = useApp((s) => s.hydrate)
	const ready = useApp((s) => s.ready)
	const presence = useApp((s) => s.presence)
	const emotion = useApp((s) => s.emotion)
	const level = useApp((s) => s.level)
	const bands = useApp((s) => s.bands)
	const interim = useApp((s) => s.interim)
	const voiceMode = useApp((s) => s.voiceMode)
	const composerOpen = useApp((s) => s.composerOpen)
	const settings = useApp((s) => s.settings)
	const inbox = useApp((s) => s.inbox)
	const error = useApp((s) => s.error)
	const send = useApp((s) => s.send)
	const setPresence = useApp((s) => s.setPresence)
	const setComposerOpen = useApp((s) => s.setComposerOpen)
	const openDialog = useApp((s) => s.openDialog)
	const dialog = useApp((s) => s.dialog)

	const [draft, setDraft] = useState("")
	const [clock, setClock] = useState("")
	const [noteListen, setNoteListen] = useState(false)
	const [menuOpen, setMenuOpen] = useState(false)
	const [micFix, setMicFix] = useState<"allow" | "settings" | null>(null)
	const holding = useRef(false)
	const holdBits = useRef("")
	const noteListenRef = useRef(false)
	const pending = pendingInboxCount(inbox)
	noteListenRef.current = noteListen

	useEffect(() => {
		void hydrate()
	}, [hydrate])

	useEffect(() => {
		if (!ready) return
		const id = window.setInterval(() => {
			void useApp.getState().tickAutomations()
		}, 20_000)
		return () => window.clearInterval(id)
	}, [ready])

	useEffect(() => {
		const tick = () => setClock(formatClock())
		tick()
		const id = window.setInterval(tick, 15_000)
		return () => window.clearInterval(id)
	}, [])

	useEffect(() => {
		const loadVoices = () => speech.listVoices()
		loadVoices()
		window.speechSynthesis?.addEventListener("voiceschanged", loadVoices)
		return () => window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices)
	}, [])

	useEffect(() => {
		speech.configure({
			onInterim: (text) => {
				if (noteListenRef.current || holding.current) {
					useApp.getState().setPresence({ interim: text })
					if (noteListenRef.current) setDraft((prev) => (prev && !holding.current ? prev : text))
				} else {
					useApp.getState().setPresence({ interim: text })
				}
			},
			onFinal: (text) => {
				const sink = browserSpeechFinalSink({
					voiceMode: useApp.getState().voiceMode,
					noteListen: noteListenRef.current,
				})
				if (sink === "note") {
					setDraft((prev) => `${prev.replace(/\s+$/, "")} ${text}`.trim())
					return
				}
				if (sink === "ignore") return
				if (holding.current) {
					holdBits.current = `${holdBits.current} ${text}`.trim()
				}
			},
			onLevel: (lv, bd) => useApp.getState().setPresence({ level: lv, bands: bd }),
			onSpeakEnd: () => {
				const s = useApp.getState()
				if (s.voiceMode) s.setPresence({ presence: "listening" })
				else s.setPresence({ presence: "idle" })
			},
			onListenEnd: () => {
				const s = useApp.getState()
				if (s.presence === "listening" && !s.voiceMode && !holding.current && !noteListenRef.current) {
					s.setPresence({ presence: "idle" })
				}
			},
			onError: (message) => {
				useApp.getState().setPresence({ error: message })
				setMicFix(speech.micFix)
			},
		})
		return () => speech.dispose()
	}, [])

	const enterVoice = useCallback(() => {
		setNoteListen(false)
		setMicFix(null)
		void enterVoiceMode()
	}, [])

	const exitVoice = useCallback(() => {
		exitVoiceMode()
	}, [])

	const startHold = useCallback(() => {
		if (!shouldStartHoldListen({ voiceMode, presence, noteListen })) return
		holding.current = true
		holdBits.current = ""
		speech.stopSpeak()
		setMicFix(null)
		setPresence({ presence: "listening", interim: "", error: null })
		void speech.startListen({ continuous: true })
	}, [noteListen, presence, setPresence, voiceMode])

	const endHold = useCallback(() => {
		if (!holding.current) return
		holding.current = false
		speech.stopListen()
		const text = (holdBits.current || useApp.getState().interim).trim()
		holdBits.current = ""
		setPresence({ presence: "idle", interim: "" })
		if (text) void send(text)
	}, [send, setPresence])

	const toggleTranscribe = useCallback(() => {
		if (noteListen) {
			setNoteListen(false)
			speech.stopListen()
			setPresence({ presence: "idle" })
			return
		}
		if (shouldExitVoiceForComposer(useApp.getState().voiceMode)) exitVoice()
		setNoteListen(true)
		setComposerOpen(true)
		setMicFix(null)
		setPresence({ presence: "listening", error: null })
		void speech.startListen({ continuous: true })
	}, [exitVoice, noteListen, setComposerOpen, setPresence])

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement | null)?.tagName
			const typing = tag === "INPUT" || tag === "TEXTAREA"
			if (e.key === "Escape") {
				speech.stopSpeak()
				speech.stopListen()
				holding.current = false
				setNoteListen(false)
				exitVoice()
				setComposerOpen(false)
				openDialog(null)
				setMenuOpen(false)
				return
			}
			if (typing) return
			if (e.key === "v" || e.key === "V") {
				e.preventDefault()
				if (voiceMode && !error) exitVoice()
				else enterVoice()
			}
			if (e.key === "t" || e.key === "T" || e.key === "/") {
				e.preventDefault()
				if (shouldExitVoiceForComposer(voiceMode)) exitVoice()
				setComposerOpen(true)
			}
			if (e.key === " " && !composerOpen && !voiceMode) {
				e.preventDefault()
				startHold()
			}
		}
		const onUp = (e: KeyboardEvent) => {
			if (e.key === " " && holding.current) {
				e.preventDefault()
				endHold()
			}
		}
		window.addEventListener("keydown", onKey)
		window.addEventListener("keyup", onUp)
		return () => {
			window.removeEventListener("keydown", onKey)
			window.removeEventListener("keyup", onUp)
		}
	}, [composerOpen, enterVoice, error, exitVoice, openDialog, setComposerOpen, startHold, endHold, voiceMode])

	const status =
		presence === "listening"
			? voiceMode
				? "Listening"
				: noteListen
					? "Transcribing"
					: "Hearing you"
			: presence === "thinking"
				? "Thinking"
				: presence === "speaking"
					? "Speaking"
					: voiceMode
						? "Voice"
						: "Idle"

	const shown = displayVoiceCaption({ showCaptions: settings.showCaptions, liveLine: interim })

	return (
		<main className="relative isolate min-h-dvh overflow-hidden bg-bg text-fg">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--color-accent)_5%,transparent),transparent_55%)]" />

			<header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
				<div>
					<p className="type-display text-2xl text-fg">{displayName(settings.agentName)}</p>
					<p className="type-clock mt-1 text-muted">{clock}</p>
				</div>
				<button
					type="button"
					aria-label={menuOpen ? "Hide tools" : "Show tools"}
					aria-expanded={menuOpen}
					onClick={() => setMenuOpen((v) => !v)}
					className={cn(
						"pointer-events-auto relative z-40 grid size-11 place-items-center rounded-full text-muted transition-[color,background-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-surface-2 hover:text-fg active:scale-[0.96]",
						menuOpen && "bg-surface-2 text-fg",
					)}
				>
					<span className="relative size-4">
						<LayoutGrid
							className={cn(
								"absolute inset-0 size-4 transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
								menuOpen ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0",
							)}
						/>
						<X
							className={cn(
								"absolute inset-0 size-4 transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
								menuOpen ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]",
							)}
						/>
					</span>
					{pending && !menuOpen ? <span className="absolute top-2 right-2 size-1.5 rounded-full bg-warn" /> : null}
				</button>
			</header>

			<PresenceCanvas
				state={presence}
				emotion={emotion}
				level={level}
				bands={bands}
				gazeX={menuOpen ? 0.55 : dialog === "settings" || dialog === "history" || dialog === "watch" ? 0.45 : 0}
				gazeY={composerOpen ? 0.4 : menuOpen ? 0 : dialog ? -0.35 : 0}
				onHoldStart={startHold}
				onHoldEnd={endHold}
				onTap={() => {
					if (voiceMode && !error) exitVoice()
					else enterVoice()
				}}
			/>

			<div className="pointer-events-none absolute inset-x-0 top-[58%] z-10 flex flex-col items-center px-6 text-center sm:top-[54%]">
				<p className="type-kicker text-muted">{status}</p>
				{shown ? (
					<p className="mt-3 max-w-md text-sm leading-relaxed text-fg/80">{shown}</p>
				) : !ready ? (
					<p className="mt-3 text-sm text-muted">Waking…</p>
				) : (
					<p className="mt-3 max-w-sm text-sm text-subtle">Tap the core for voice. Hold to speak a note. T to type.</p>
				)}
				{error ? (
					<div className="mt-3 flex max-w-sm flex-col items-center gap-2">
						<p className="text-xs text-subtle">{error}</p>
						{micFix || /mic is blocked|microphone/i.test(error) ? (
							<button
								type="button"
								className="pointer-events-auto text-xs text-fg underline decoration-border underline-offset-4"
								onClick={() => {
									void allowMicrophone().then((result) => {
										if (result !== "granted") {
											setMicFix("settings")
											return
										}
										setMicFix(null)
										useApp.getState().setPresence({ error: null })
										if (useApp.getState().voiceMode) void restartVoiceIfNeeded()
									})
								}}
							>
								{micFix === "settings" ? `Open ${systemSettingsLabel()}` : "Allow microphone"}
							</button>
						) : null}
					</div>
				) : null}
			</div>

			<div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
				<div className="relative w-full max-w-xl">
					<div
						className={cn(
							"flex items-center justify-center gap-2 transition-[opacity,transform,filter] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
							composerOpen || menuOpen
								? "pointer-events-none scale-[0.98] opacity-0 blur-[2px]"
								: "pointer-events-auto scale-100 opacity-100 blur-0",
						)}
					>
						<ModeBtn
							active={voiceMode}
							label="Voice"
							onClick={() => {
								if (voiceMode && !error) exitVoice()
								else enterVoice()
							}}
						>
							<Radio className="size-4" />
						</ModeBtn>
						<ModeBtn
							active={false}
							label="Type"
							onClick={() => {
								if (voiceMode) exitVoice()
								setComposerOpen(true)
								setPresence({ error: null })
							}}
						>
							<Keyboard className="size-4" />
						</ModeBtn>
					</div>
					<div className="absolute inset-x-0 bottom-0">
						<Composer
							open={composerOpen}
							value={draft}
							listening={noteListen && presence === "listening"}
							disabled={presence === "thinking"}
							onChange={setDraft}
							onSend={() => {
								const text = draft.trim()
								if (!text) return
								setDraft("")
								setNoteListen(false)
								speech.stopListen()
								void send(text)
							}}
							onToggleListen={toggleTranscribe}
						/>
					</div>
				</div>
			</div>

			<div
				className={cn(
					"absolute inset-0 z-30 transition-[opacity,backdrop-filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
					menuOpen ? "opacity-100" : "pointer-events-none opacity-0",
				)}
			>
				<button
					type="button"
					aria-label="Dismiss tools"
					className="absolute inset-0 bg-bg/55"
					onClick={() => setMenuOpen(false)}
				/>
				<div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col justify-center gap-3 px-6 sm:px-10">
					{TOOLS.map((tool, i) => (
						<button
							key={tool.id}
							type="button"
							onClick={() => {
								openDialog(tool.id)
								setMenuOpen(false)
							}}
							style={{ transitionDelay: menuOpen ? `${i * 45}ms` : "0ms" }}
							className={cn(
								"group flex items-center justify-end gap-4 text-right transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96]",
								menuOpen ? "translate-x-0 opacity-100 blur-0" : "translate-x-6 opacity-0 blur-[4px]",
							)}
						>
							<span className="min-w-0">
								<span className="block type-display text-2xl text-fg">{tool.label}</span>
								<span className="block text-xs text-muted">{tool.hint}</span>
							</span>
							<span className="relative grid size-14 shrink-0 place-items-center rounded-full border border-border bg-surface text-fg transition-colors group-hover:border-border-strong group-hover:bg-surface-2">
								<tool.icon className="size-5" />
								{tool.id === "watch" && pending ? (
									<span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-warn" />
								) : null}
							</span>
						</button>
					))}
				</div>
			</div>
			<HistoryDialog />
			<MemoryDialog />
			<RoutinesDialog />
			<WatchDialog />
			<SettingsDialog />
			<ArtifactDialog />
		</main>
	)
}

function ModeBtn({
	active,
	label,
	onClick,
	children,
}: {
	active: boolean
	label: string
	onClick: () => void
	children: ReactNode
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"type-chip flex h-11 items-center gap-2 rounded-full border px-4 transition-colors",
				active ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-muted hover:text-fg",
			)}
		>
			{children}
			{label}
		</button>
	)
}
