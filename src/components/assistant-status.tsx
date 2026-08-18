import { systemSettingsLabel } from "@/lib/host"
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
}: {
	ready: boolean
	status: string
	interim: string
	error: string | null
	micFix: "allow" | "settings" | null
	onMicFix: (next: "allow" | "settings" | null) => void
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
			) : (
				<p className="mt-3 max-w-sm text-sm text-subtle">Tap the core for voice. Hold to speak a note. T to type.</p>
			)}
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
