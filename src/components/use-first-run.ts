import { useCallback, useEffect, useState } from "react"
import type { SetupPending } from "@/components/setup-sheet"
import { type FirstRunVerb, onboardingNeeded } from "@/lib/first-run"
import { hostCaps, liveSettings } from "@/lib/host"
import { useApp } from "@/lib/store"
import { enterVoiceMode, exitVoiceMode } from "@/lib/voice-mode"

export function useFirstRunGate() {
	const send = useApp((s) => s.send)
	const voiceMode = useApp((s) => s.voiceMode)
	const error = useApp((s) => s.error)
	const ready = useApp((s) => s.ready)
	const settings = useApp((s) => s.settings)
	const openDialog = useApp((s) => s.openDialog)
	const setComposerOpen = useApp((s) => s.setComposerOpen)
	const [setupOpen, setSetupOpen] = useState(false)
	const [setupPending, setSetupPending] = useState<SetupPending | null>(null)
	const [draftSeed, setDraftSeed] = useState<string | null>(null)
	const needed = onboardingNeeded(liveSettings(settings), hostCaps())

	useEffect(() => {
		if (!ready) return
		if (needed) setSetupOpen(true)
	}, [needed, ready])

	const exitVoice = useCallback(() => {
		exitVoiceMode()
	}, [])

	const enterVoice = useCallback(() => {
		if (onboardingNeeded(liveSettings(useApp.getState().settings), hostCaps())) {
			setSetupPending({ kind: "voice" })
			setSetupOpen(true)
			return
		}
		void enterVoiceMode()
	}, [])

	const requestSend = useCallback(
		(text: string) => {
			const trimmed = text.trim()
			if (!trimmed) return
			if (onboardingNeeded(liveSettings(useApp.getState().settings), hostCaps())) {
				setDraftSeed(trimmed)
				setSetupPending({ kind: "send", text: trimmed })
				setSetupOpen(true)
				return
			}
			void send(trimmed)
		},
		[send],
	)

	const requestSettings = useCallback(() => {
		if (onboardingNeeded(liveSettings(useApp.getState().settings), hostCaps())) {
			setSetupOpen(true)
			return
		}
		openDialog("settings")
	}, [openDialog])

	const onSetupReady = useCallback(
		(pending: SetupPending) => {
			if (pending.kind === "send") {
				setDraftSeed("")
				void send(pending.text)
				return
			}
			void enterVoiceMode()
		},
		[send],
	)

	const onVerb = useCallback(
		(verb: FirstRunVerb) => {
			if (verb.startsVoice) {
				if (voiceMode && !error) exitVoice()
				else enterVoice()
				return
			}
			if (verb.draft) {
				if (verb.send) {
					requestSend(verb.draft)
					return
				}
				setDraftSeed(verb.draft)
				setComposerOpen(true)
			}
		},
		[enterVoice, error, exitVoice, requestSend, setComposerOpen, voiceMode],
	)

	const closeSetup = useCallback((open: boolean) => {
		if (!open && onboardingNeeded(liveSettings(useApp.getState().settings), hostCaps())) return
		setSetupOpen(open)
		if (!open) setSetupPending(null)
	}, [])

	return {
		setupOpen,
		setupPending,
		draftSeed,
		clearDraftSeed: () => setDraftSeed(null),
		enterVoice,
		exitVoice,
		requestSend,
		requestSettings,
		onSetupReady,
		onVerb,
		closeSetup,
	}
}
