import { useEffect, useState } from "react"
import { Field } from "@/components/settings-field"
import { ModelTab } from "@/components/settings-model"
import { VoiceTab } from "@/components/settings-voice"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { type OnboardingStepId, onboardingNeeded, providerSetupNeeded, voiceCloudSetupNeeded } from "@/lib/first-run"
import { hostCaps, liveSettings } from "@/lib/host"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"

export type SetupPending = { kind: "send"; text: string } | { kind: "voice" }

const STEPS: { id: OnboardingStepId; title: string; description: string }[] = [
	{ id: "provider", title: "Where should I think?", description: "Pick a model on this device, or a cloud key." },
	{ id: "voice", title: "How should I sound?", description: "One voice. Hear it before you continue." },
	{ id: "soul", title: "How should I be?", description: "A standing brief. Tone, what to watch, what not to do." },
]

export function SetupSheet({
	open,
	pending,
	onOpenChange,
	onReady,
}: {
	open: boolean
	pending: SetupPending | null
	onOpenChange: (open: boolean) => void
	onReady: (pending: SetupPending) => void
}) {
	const settings = useApp((s) => s.settings)
	const patch = useApp((s) => s.patchSettings)
	const caps = hostCaps()
	const needed = onboardingNeeded(liveSettings(settings), caps)
	const [step, setStep] = useState<OnboardingStepId>(needed ?? "provider")
	const [ggufBusy, setGgufBusy] = useState(false)
	const index = STEPS.findIndex((s) => s.id === step)
	const copy = STEPS[index] ?? STEPS[0]

	useEffect(() => {
		if (!open) return
		setStep(onboardingNeeded(liveSettings(useApp.getState().settings), hostCaps()) ?? "provider")
	}, [open])

	const live = liveSettings(settings)
	const providerReady = !providerSetupNeeded(live.provider)
	const voiceReady = !voiceCloudSetupNeeded(live.voiceBackend, live.provider)
	const soulReady = Boolean(settings.brief.trim())
	const canContinue = step === "provider" ? providerReady && !ggufBusy : step === "voice" ? voiceReady : soulReady

	const finish = () => {
		onOpenChange(false)
		if (pending) onReady(pending)
	}

	const goNext = async () => {
		if (step === "provider") {
			setStep("voice")
			return
		}
		if (step === "voice") {
			setStep("soul")
			return
		}
		finish()
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next && needed) return
				onOpenChange(next)
			}}
			disablePointerDismissal
		>
			<DialogContent showCloseButton={false} className="sm:max-w-2xl">
				<DialogHeader className="pr-0">
					<p className="text-xs text-muted-foreground">
						{index + 1} of {STEPS.length}
					</p>
					<DialogTitle>{copy.title}</DialogTitle>
					<DialogDescription>{copy.description}</DialogDescription>
				</DialogHeader>
				<div className="flex gap-1.5" aria-hidden>
					{STEPS.map((item, i) => (
						<span key={item.id} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-primary" : "bg-surface-2")} />
					))}
				</div>
				<div
					key={step}
					data-onboarding-step={step}
					className="flex min-h-40 max-h-[min(52dvh,28rem)] flex-col gap-4 overflow-y-auto animate-in fade-in slide-in-from-right-4 duration-300"
				>
					{step === "provider" ? <ModelTab onGgufBusy={setGgufBusy} /> : null}
					{step === "voice" ? <VoiceTab /> : null}
					{step === "soul" ? (
						<Field label="Standing brief" field="brief">
							<Textarea
								value={settings.brief}
								onChange={(e) => patch({ brief: e.target.value })}
								placeholder="Direct. Keep household context. Don't lecture."
								rows={5}
							/>
						</Field>
					) : null}
				</div>
				<DialogFooter className="sm:justify-between">
					{index > 0 ? (
						<Button type="button" variant="ghost" onClick={() => setStep(STEPS[index - 1]?.id ?? "provider")}>
							Back
						</Button>
					) : (
						<span />
					)}
					<Button type="button" disabled={!canContinue} onClick={() => void goNext()}>
						{step === "soul" ? "Start" : "Continue"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
