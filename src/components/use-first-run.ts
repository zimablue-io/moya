import { useCallback, useState } from "react"
import type { SetupPending } from "@/components/setup-sheet"
import { type FirstRunVerb, providerSetupNeeded, voiceCloudSetupNeeded } from "@/lib/first-run"
import { liveSettings } from "@/lib/host"
import { useApp } from "@/lib/store"
import { enterVoiceMode, exitVoiceMode } from "@/lib/voice-mode"

export function useFirstRunGate() {
	const send = useApp((s) => s.send)
	const voiceMode = useApp((s) => s.voiceMode)
	const error = useApp((s) => s.error)
	const setComposerOpen = useApp((s) => s.setComposerOpen)
	const [setupOpen, setSetupOpen] = useState(false)
	const [setupPending, setSetupPending] = useState<SetupPending | null>(null)
	const [draftSeed, setDraftSeed] = useState<string | null>(null)

	const exitVoice = useCallback(() => {
		exitVoiceMode()
	}, [])

	const enterVoice = useCallback(() => {
		const next = liveSettings(useApp.getState().settings)
		if (voiceCloudSetupNeeded(next.voiceBackend, next.provider)) {
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
			if (providerSetupNeeded(liveSettings(useApp.getState().settings).provider)) {
				setDraftSeed(trimmed)
				setSetupPending({ kind: "send", text: trimmed })
				setSetupOpen(true)
				return
			}
			void send(trimmed)
		},
		[send],
	)

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
		onSetupReady,
		onVerb,
		closeSetup,
	}
}
