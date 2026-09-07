import { Mars, Play, Square, Venus } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Field } from "@/components/settings-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { speakerGender, speakersFor, type VoiceBackendId } from "@/lib/types"
import { listRealtimeSpeakers, type SpeakerOption } from "@/lib/voice-catalog"
import { conversationVoice, VOICE_SETTINGS_COPY } from "@/lib/voice-contract"
import { VOICE_PREVIEW_TEXT } from "@/lib/voice-preview"
import { prepareSpokenReply, speakReply, stopSpokenReply } from "@/lib/voice-speak"

export function SpokenVoice({
	id,
	baseUrl,
	apiKey,
	model,
	value,
	onChange,
	onCommit,
}: {
	id: VoiceBackendId
	baseUrl: string
	apiKey: string
	model: string
	value: string
	onChange: (v: string) => void | Promise<void>
	onCommit?: () => void | Promise<void>
}) {
	const [speakers, setSpeakers] = useState<SpeakerOption[]>(() => speakersFor(id, baseUrl))
	useEffect(() => {
		let cancelled = false
		setSpeakers(speakersFor(id, baseUrl))
		void listRealtimeSpeakers({ id, baseUrl, apiKey }, { fallback: speakersFor(id, baseUrl) }).then((list) => {
			if (!cancelled && list.length) setSpeakers(list)
		})
		return () => {
			cancelled = true
		}
	}, [id, baseUrl, apiKey])

	const preview = <VoicePreviewButton id={id} baseUrl={baseUrl} apiKey={apiKey} model={model} value={value} />

	if (!speakers.length) {
		return (
			<Field label={VOICE_SETTINGS_COPY.conversationSpeaker}>
				<div className="flex gap-2">
					<Input
						className="min-w-0 flex-1"
						value={value}
						onChange={(e) => onChange(e.target.value)}
						onBlur={() => onCommit?.()}
						placeholder="af_heart"
					/>
					{preview}
				</div>
			</Field>
		)
	}
	const known = speakers.some((v) => v.id === value)
	const selected = known ? value : value ? "__other__" : (speakers[0]?.id ?? "")
	const items = [
		...speakers.map((v) => ({ value: v.id, label: v.label })),
		...(!known && value ? [{ value: "__other__", label: value }] : []),
	]

	return (
		<Field
			label={VOICE_SETTINGS_COPY.conversationSpeaker}
			tip={id === "s2s" ? VOICE_SETTINGS_COPY.conversationTipLocal : VOICE_SETTINGS_COPY.conversationTipLive}
		>
			<div className="flex gap-2">
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
					<SelectTrigger className="min-w-0 w-auto flex-1">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{speakers.map((v) => {
							const gender = speakerGender(v.id)
							return (
								<SelectItem key={v.id} value={v.id} aria-label={voiceOptionLabel(v.label, gender)}>
									{gender === "woman" ? <Venus className="size-3.5 text-muted-foreground" aria-hidden /> : null}
									{gender === "man" ? <Mars className="size-3.5 text-muted-foreground" aria-hidden /> : null}
									{v.label}
								</SelectItem>
							)
						})}
						{!known && value ? <SelectItem value="__other__">{value}</SelectItem> : null}
					</SelectContent>
				</Select>
				{preview}
			</div>
		</Field>
	)
}

function VoicePreviewButton({
	id,
	baseUrl,
	apiKey,
	model,
	value,
}: {
	id: VoiceBackendId
	baseUrl: string
	apiKey: string
	model: string
	value: string
}) {
	const [playing, setPlaying] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const playingRef = useRef(false)
	playingRef.current = playing

	const stop = () => {
		stopSpokenReply()
		setPlaying(false)
	}

	useEffect(() => {
		return () => {
			if (playingRef.current) stopSpokenReply()
		}
	}, [])

	return (
		<Button
			type="button"
			variant="outline"
			size="icon"
			className="shrink-0"
			disabled={!baseUrl.trim()}
			title={error ?? (playing ? "Stop preview" : "Hear this voice")}
			aria-pressed={playing}
			aria-label={playing ? "Stop preview" : "Hear this voice"}
			onClick={() => {
				if (playing) {
					stop()
					return
				}
				setError(null)
				const voice = conversationVoice({
					voiceBackend: { id, baseUrl, apiKey, model, voice: value },
				})
				if (!voice) {
					setError("Pick a voice first.")
					return
				}
				prepareSpokenReply()
				setPlaying(true)
				speakReply({ id, baseUrl, apiKey, model, voice }, VOICE_PREVIEW_TEXT, {
					onEnd: () => setPlaying(false),
					onError: (message) => {
						setError(message)
						setPlaying(false)
					},
				})
			}}
		>
			{playing ? <Square className="size-4" /> : <Play className="size-4" />}
		</Button>
	)
}

function voiceOptionLabel(label: string, gender: "woman" | "man" | null): string {
	if (gender === "woman") return `${label}, woman`
	if (gender === "man") return `${label}, man`
	return label
}
