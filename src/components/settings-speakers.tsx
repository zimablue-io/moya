import { Play, Square } from "lucide-react"
import { useEffect, useState } from "react"
import { Field } from "@/components/settings-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { speech } from "@/lib/speech"
import { speakersFor, type VoiceBackendId } from "@/lib/types"
import { listRealtimeSpeakers, type SpeakerOption } from "@/lib/voice-catalog"
import { VOICE_SETTINGS_COPY } from "@/lib/voice-contract"

export function SpokenVoice({
	id,
	baseUrl,
	apiKey,
	value,
	onChange,
	onCommit,
}: {
	id: VoiceBackendId
	baseUrl: string
	apiKey: string
	value: string
	onChange: (v: string) => void
	onCommit?: () => void
}) {
	const [speakers, setSpeakers] = useState<SpeakerOption[]>(() => speakersFor(id))
	useEffect(() => {
		let cancelled = false
		setSpeakers(speakersFor(id))
		void listRealtimeSpeakers({ id, baseUrl, apiKey }, { fallback: speakersFor(id) }).then((list) => {
			if (!cancelled && list.length) setSpeakers(list)
		})
		return () => {
			cancelled = true
		}
	}, [id, baseUrl, apiKey])

	if (!speakers.length) {
		return (
			<Field label={VOICE_SETTINGS_COPY.conversationSpeaker}>
				<Input
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onBlur={() => onCommit?.()}
					placeholder="af_heart"
				/>
			</Field>
		)
	}
	const known = speakers.some((v) => v.id === value)
	const selected = known ? value : value ? "__other__" : (speakers[0]?.id ?? "")
	const groups = speakerGroups(speakers)
	return (
		<Field
			label={VOICE_SETTINGS_COPY.conversationSpeaker}
			tip={id === "s2s" ? VOICE_SETTINGS_COPY.conversationTipLocal : id === "xai" ? "Live list from xAI." : undefined}
		>
			<select
				className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
				value={selected}
				onChange={(e) => {
					if (e.target.value === "__other__") return
					onChange(e.target.value)
					onCommit?.()
				}}
			>
				{groups.map((group) =>
					group.name ? (
						<optgroup key={group.name} label={group.name}>
							{group.items.map((v) => (
								<option key={v.id} value={v.id}>
									{v.label}
								</option>
							))}
						</optgroup>
					) : (
						group.items.map((v) => (
							<option key={v.id} value={v.id}>
								{v.label}
							</option>
						))
					),
				)}
				{!known && value ? <option value="__other__">{value}</option> : null}
			</select>
		</Field>
	)
}

function speakerGroups(speakers: SpeakerOption[]): { name: string; items: SpeakerOption[] }[] {
	const groups: { name: string; items: SpeakerOption[] }[] = []
	const index = new Map<string, SpeakerOption[]>()
	for (const speaker of speakers) {
		const name = speaker.group ?? ""
		let items = index.get(name)
		if (!items) {
			items = []
			index.set(name, items)
			groups.push({ name, items })
		}
		items.push(speaker)
	}
	return groups
}

export function MacVoicePicker({
	voices,
	value,
	previewing,
	onVoice,
	onPreview,
	onStop,
}: {
	voices: SpeechSynthesisVoice[]
	value: string
	previewing: boolean
	onVoice: (voiceURI: string) => void
	onPreview: () => void
	onStop: () => void
}) {
	return (
		<div className="flex gap-2">
			<select
				id="voice-select"
				className="h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm"
				value={value}
				onChange={(e) => onVoice(e.target.value)}
			>
				<option value="">System default</option>
				{value && !voices.some((v) => v.voiceURI === value) ? <option value={value}>Saved voice</option> : null}
				{voices.map((v) => (
					<option key={v.voiceURI} value={v.voiceURI}>
						{v.name} ({v.lang})
					</option>
				))}
			</select>
			<Button
				type="button"
				variant="outline"
				size="icon"
				className="shrink-0"
				disabled={!speech.ttsSupported}
				aria-pressed={previewing}
				aria-label={previewing ? "Stop preview" : "Hear this voice"}
				onClick={() => (previewing ? onStop() : onPreview())}
			>
				{previewing ? <Square className="size-4" /> : <Play className="size-4" />}
			</Button>
		</div>
	)
}
