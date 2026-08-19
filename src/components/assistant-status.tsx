import { FIRST_RUN_VERBS, type FirstRunVerb, firstRunHint } from "@/lib/first-run"
import { detectHostOs, isDesktop, systemSettingsLabel } from "@/lib/host"
import { allowMicrophone } from "@/lib/media-permission"
import { displayVoiceCaption } from "@/lib/realtime-protocol"
import { useApp } from "@/lib/store"
import { restartVoiceIfNeeded } from "@/lib/voice-mode"

export function AssistantStatus({
	ready,
	status,
	interim,
	error,
	micFix,
	onMicFix,
	firstRun,
	onVerb,
}: {
	ready: boolean
	status: string
	interim: string
	error: string | null
	micFix: "allow" | "settings" | null
	onMicFix: (next: "allow" | "settings" | null) => void
	firstRun: boolean
	onVerb: (verb: FirstRunVerb) => void
}) {
	const showCaptions = useApp((s) => s.settings.showCaptions)
	const shown = displayVoiceCaption({ showCaptions, liveLine: interim })

	return (
		<div className="pointer-events-none absolute inset-x-0 top-[58%] z-10 flex flex-col items-center px-6 text-center sm:top-[54%]">
			<p className="type-kicker text-muted-foreground">{status}</p>
			{shown ? (
				<p className="mt-3 max-w-md text-sm leading-relaxed text-fg/80">{shown}</p>
			) : !ready ? (
				<p className="mt-3 text-sm text-muted-foreground">Waking…</p>
			) : firstRun ? (
				<p className="mt-3 max-w-sm text-sm text-subtle">{firstRunHint(isDesktop(), detectHostOs())}</p>
			) : (
				<p className="mt-3 max-w-sm text-sm text-subtle">Tap the core for voice. Hold to speak a note. T to type.</p>
			)}
			{firstRun && ready && !shown ? (
				<div className="pointer-events-auto mt-4 flex flex-wrap justify-center gap-2">
					{FIRST_RUN_VERBS.map((verb) => (
						<button
							key={verb.id}
							type="button"
							onClick={() => onVerb(verb)}
							className="type-chip h-11 rounded-full border border-border bg-surface px-4 text-muted-foreground transition-colors outline-none hover:text-fg focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
						>
							{verb.label}
						</button>
					))}
				</div>
			) : null}
			{error ? (
				<div className="mt-3 flex max-w-sm flex-col items-center gap-2">
					<p className="text-xs text-subtle">{error}</p>
					{micFix || /mic is blocked|microphone/i.test(error) ? (
						<button
							type="button"
							className="pointer-events-auto text-xs text-fg underline decoration-border underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
							onClick={() => {
								void allowMicrophone().then((result) => {
									if (result !== "granted") {
										onMicFix("settings")
										return
									}
									onMicFix(null)
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
	)
}
