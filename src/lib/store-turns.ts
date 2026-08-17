import { type AutomationDraft, isDue, makeAutomation, quietReply } from "./automations"
import { dispatch, runTurn } from "./environment"
import { notify } from "./host"
import { speech } from "./speech"
import { applyEnv, envFromStore, type Live } from "./store-env"
import type { Artifact, Message, Snapshot } from "./types"
import { nowIso, uid } from "./utils"
import { shouldSpeakTypedReply } from "./voice-contract"

type StoreApi = Snapshot &
	Live & {
		persist: () => void
		addUserMessage: (text: string) => Message
		runAutomation: (id: string, opts?: { speak?: boolean }) => Promise<void>
	}

type Get = () => StoreApi
type Set = (p: Partial<StoreApi>) => void

export function createTurnActions(get: Get, set: Set) {
	return {
		commitVoiceUser: (text: string): Message | null => {
			const trimmed = text.trim()
			if (!trimmed) return null
			const last = [...get().messages].reverse().find((m) => !m.hidden)
			if (last?.role === "user" && last.content === trimmed) return last
			return get().addUserMessage(trimmed)
		},

		commitVoiceAssistant: (text: string) => {
			const trimmed = text.trim()
			if (!trimmed) return
			const last = [...get().messages].reverse().find((m) => !m.hidden)
			if (last?.role === "assistant" && last.content === trimmed) {
				set({ caption: trimmed })
				return
			}
			const em = /sorry|cannot|can't|blocked|urgent/i.test(trimmed)
				? "concerned"
				: /good|glad|nice|yes/i.test(trimmed)
					? "warm"
					: "calm"
			const reply: Message = {
				id: uid("a"),
				role: "assistant",
				content: trimmed,
				createdAt: nowIso(),
				emotion: em,
			}
			set({ messages: [...get().messages, reply], emotion: em, caption: trimmed })
			get().persist()
		},

		executeVoiceTool: async (name: string, args: string): Promise<{ content: string; artifact?: Artifact }> => {
			const { env, receipt } = await dispatch(envFromStore(get()), name, args)
			set(applyEnv(env))
			get().persist()
			return {
				content: JSON.stringify({ ok: receipt.ok, summary: receipt.summary, data: receipt.data ?? null }),
				artifact: env.ui.artifact ?? undefined,
			}
		},

		send: async (text: string) => {
			const trimmed = text.trim()
			if (!trimmed) return
			const store = get()
			if (store.presence === "thinking") return
			store.addUserMessage(trimmed)
			set({ presence: "thinking", caption: "", interim: "", error: null, emotion: "focused" })

			const beforeInbox = get().inbox
			const result = await runTurn({
				env: envFromStore(get()),
				text: trimmed,
				kind: "text",
				appendUser: false,
			})

			const spoken = result.spoken
			const em = /sorry|cannot|can't|blocked|urgent/i.test(spoken)
				? "concerned"
				: /good|glad|nice|yes/i.test(spoken)
					? "warm"
					: "calm"
			const speakBrowser = shouldSpeakTypedReply({
				autoSpeak: get().settings.autoSpeak,
				voiceMode: get().voiceMode,
			})
			set({
				...applyEnv(result.env),
				emotion: em,
				caption: spoken,
				error:
					result.error && !/not available|Add a key|Add an API key/i.test(result.error) ? result.error : get().error,
				presence: speakBrowser ? "speaking" : get().voiceMode ? "listening" : "idle",
			})
			get().persist()
			const added = result.env.snapshot.inbox.filter((i) => !i.resolvedAt && !beforeInbox.some((x) => x.id === i.id))
			if (added[0]) void notify(added[0].title, added[0].body)

			if (speakBrowser) {
				speech.speak(spoken, {
					voiceURI: get().settings.voiceURI,
					rate: get().settings.rate,
					pitch: get().settings.pitch,
				})
			}
		},

		runAutomation: async (id: string, opts?: { speak?: boolean }) => {
			const auto = get().automations.find((a) => a.id === id)
			if (!auto || get().runningAutomation) return
			const speak = opts?.speak ?? false
			const beforeInbox = get().inbox
			set({
				runningAutomation: id,
				presence: get().presence === "idle" ? "thinking" : get().presence,
				emotion: "focused",
			})

			const result = await runTurn({
				env: envFromStore(get()),
				text: `Run routine: ${auto.name}. ${auto.brief}`,
				kind: "routine",
				routineId: id,
				appendUser: false,
			})

			const keep = !quietReply(result.spoken)
			set({
				...applyEnv(result.env),
				runningAutomation: null,
				presence: speak && keep && get().settings.autoSpeak ? "speaking" : get().voiceMode ? "listening" : "idle",
				caption: keep ? result.spoken : get().caption,
			})
			get().persist()
			const addedAuto = result.env.snapshot.inbox.filter(
				(i) => !i.resolvedAt && !beforeInbox.some((x) => x.id === i.id),
			)
			if (addedAuto[0]) void notify(addedAuto[0].title, addedAuto[0].body)

			if (speak && keep && shouldSpeakTypedReply({ autoSpeak: get().settings.autoSpeak, voiceMode: get().voiceMode })) {
				speech.speak(result.spoken, {
					voiceURI: get().settings.voiceURI,
					rate: get().settings.rate,
					pitch: get().settings.pitch,
				})
			}
		},

		tickAutomations: async () => {
			const s = get()
			if (!s.ready || s.presence === "thinking" || s.runningAutomation) return
			const due = s.automations.find((a) => isDue(a))
			if (!due) return
			const busy = s.presence === "listening" || s.presence === "speaking" || s.voiceMode
			await get().runAutomation(due.id, { speak: !busy })
		},

		addAutomation: (draft: AutomationDraft) => {
			const auto = makeAutomation(draft)
			set({ automations: [auto, ...get().automations] })
			get().persist()
		},
	}
}
