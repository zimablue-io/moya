import { Play, Square } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Field } from "@/components/settings-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
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
	onChange: (v: string) => void | Promise<void>
	onCommit?: () => void | Promise<void>
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
	const items = [
		...groups.flatMap((group) => group.items.map((v) => ({ value: v.id, label: v.label }))),
		...(!known && value ? [{ value: "__other__", label: value }] : []),
	]

	return (
		<Field
			label={VOICE_SETTINGS_COPY.conversationSpeaker}
			tip={id === "s2s" ? VOICE_SETTINGS_COPY.conversationTipLocal : id === "xai" ? "Live list from xAI." : undefined}
		>
			<Select
				items={items}
				value={selected}
				onValueChange={(v) => {
					if (!v || v === "__other__") return
					void (async () => {
						await onChange(v)
						await onCommit?.()
					})()
				}}
			>
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{groups.map((group) =>
						group.name ? (
							<SelectGroup key={group.name}>
								<SelectLabel>{group.name}</SelectLabel>
								{group.items.map((v) => (
									<SelectItem key={v.id} value={v.id}>
										{v.label}
									</SelectItem>
								))}
							</SelectGroup>
						) : (
							group.items.map((v) => (
								<SelectItem key={v.id} value={v.id}>
									{v.label}
								</SelectItem>
							))
						),
					)}
					{!known && value ? <SelectItem value="__other__">{value}</SelectItem> : null}
				</SelectContent>
			</Select>
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

export function SystemVoicePicker({
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
	const items = useMemo(() => {
		const next = [{ value: "", label: "System default" }]
		if (value && !voices.some((v) => v.voiceURI === value)) next.push({ value, label: "Saved voice" })
		for (const v of voices) next.push({ value: v.voiceURI, label: `${v.name} (${v.lang})` })
		return next
	}, [value, voices])

	return (
		<div className="flex gap-2">
			<Select
				id="voice-select"
				items={items}
				value={value}
				onValueChange={(v) => {
					if (v != null) onVoice(v)
				}}
			>
				<SelectTrigger className="min-w-0 w-auto flex-1">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="">System default</SelectItem>
					{value && !voices.some((v) => v.voiceURI === value) ? (
						<SelectItem value={value}>Saved voice</SelectItem>
					) : null}
					{voices.map((v) => (
						<SelectItem key={v.voiceURI} value={v.voiceURI}>
							{v.name} ({v.lang})
						</SelectItem>
					))}
				</SelectContent>
			</Select>
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
