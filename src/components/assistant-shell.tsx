import { useCallback, useEffect, useRef, useState } from "react"
import { ArtifactDialog } from "@/components/artifact-dialog"
import { AssistantDock } from "@/components/assistant-dock"
import { AssistantHeader } from "@/components/assistant-header"
import { AssistantMenu } from "@/components/assistant-menu"
import { AssistantStatus } from "@/components/assistant-status"
import { HistoryDialog } from "@/components/history-dialog"
import { MemoryDialog } from "@/components/memory-dialog"
import { PresenceCanvas } from "@/components/presence-canvas"
import { RoutinesDialog } from "@/components/routines-dialog"
import { SettingsDialog } from "@/components/settings-dialog"
import { WatchDialog } from "@/components/watch-dialog"
import { speech } from "@/lib/speech"
import { pendingInboxCount, useApp } from "@/lib/store"
import { formatClock } from "@/lib/utils"
import { browserSpeechFinalSink, shouldExitVoiceForComposer, shouldStartHoldListen } from "@/lib/voice-contract"
import { enterVoiceMode, exitVoiceMode } from "@/lib/voice-mode"

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
	const inbox = useApp((s) => s.inbox)
	const error = useApp((s) => s.error)
	const send = useApp((s) => s.send)
	const setPresence = useApp((s) => s.setPresence)
	const setComposerOpen = useApp((s) => s.setComposerOpen)
	const closeUi = useApp((s) => s.closeUi)
	const dialog = useApp((s) => s.dialog)
	const menuOpen = useApp((s) => s.menuOpen)

	const [draft, setDraft] = useState("")
	const [clock, setClock] = useState("")
	const [noteListen, setNoteListen] = useState(false)
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
				closeUi(true)
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
	}, [closeUi, composerOpen, enterVoice, error, exitVoice, setComposerOpen, startHold, endHold, voiceMode])

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

	return (
		<main className="relative isolate min-h-dvh overflow-hidden bg-bg text-fg">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--primary)_5%,transparent),transparent_55%)]" />

			<AssistantHeader clock={clock} pending={pending} />

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

			<AssistantStatus
				ready={ready}
				status={status}
				interim={interim}
				error={error}
				micFix={micFix}
				onMicFix={setMicFix}
			/>

			<AssistantDock
				composerOpen={composerOpen}
				menuOpen={menuOpen}
				voiceMode={voiceMode}
				draft={draft}
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
				onVoice={() => {
					if (voiceMode && !error) exitVoice()
					else enterVoice()
				}}
				onType={() => {
					if (voiceMode) exitVoice()
					setComposerOpen(true)
					setPresence({ error: null })
				}}
			/>

			<AssistantMenu pending={pending} />
			<HistoryDialog />
			<MemoryDialog />
			<RoutinesDialog />
			<WatchDialog />
			<SettingsDialog />
			<ArtifactDialog />
		</main>
	)
}
