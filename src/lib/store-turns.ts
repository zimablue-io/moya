import { type AutomationDraft, isDue, makeAutomation, quietReply } from "./automations"
import { dispatch, runTurn } from "./environment"
import { liveSettings, notify } from "./host"
import { completeTurn } from "./llm"
import { applyEnv, envFromStore, type Live } from "./store-env"
import type { Artifact, Emotion, Message, Snapshot } from "./types"
import { nowIso, uid } from "./utils"
import { prepareSpokenReply, speakReply, speakReplyTarget, stopSpokenReply } from "./voice-speak"

type StoreApi = Snapshot &
	Live & {
		persist: () => void
		addUserMessage: (text: string) => Message
		runAutomation: (id: string) => Promise<void>
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
			stopSpokenReply()
			prepareSpokenReply()
			store.addUserMessage(trimmed)
			set({ presence: "thinking", caption: "", interim: "", error: null, emotion: "focused" })

			const beforeInbox = get().inbox
			const result = await runTurn({
				env: envFromStore(get()),
				text: trimmed,
				kind: "text",
				appendUser: false,
				complete: (req) => completeTurn({ ...req, provider: liveSettings(get().settings).provider }),
			})

			const spoken = result.spoken
			const em: Emotion = /sorry|cannot|can't|blocked|urgent/i.test(spoken)
				? "concerned"
				: /good|glad|nice|yes/i.test(spoken)
					? "warm"
					: "calm"
			const live = liveSettings(get().settings)
			const target = !get().voiceMode && spoken ? speakReplyTarget(live, live.provider) : null
			const patch = {
				...applyEnv(result.env),
				emotion: em,
				caption: spoken,
				error: result.error ?? null,
			}
			if (target) set({ ...patch, presence: "speaking" })
			else set({ ...patch, presence: get().voiceMode ? "listening" : "idle" })
			get().persist()
			const added = result.env.snapshot.inbox.filter((i) => !i.resolvedAt && !beforeInbox.some((x) => x.id === i.id))
			if (added[0]) void notify(added[0].title, added[0].body)
			if (target) {
				speakReply(target, spoken, {
					onEnd: () => {
						if (get().presence === "speaking") set({ presence: "idle" })
					},
					onError: (message) => {
						if (get().presence === "thinking") return
						set({ presence: "idle", error: get().error ?? message })
					},
				})
			}
		},

		runAutomation: async (id: string) => {
			const auto = get().automations.find((a) => a.id === id)
			if (!auto || get().runningAutomation) return
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
				complete: (req) => completeTurn({ ...req, provider: liveSettings(get().settings).provider }),
			})

			const keep = !quietReply(result.spoken)
			set({
				...applyEnv(result.env),
				runningAutomation: null,
				presence: get().voiceMode ? "listening" : "idle",
				caption: keep ? result.spoken : get().caption,
			})
			get().persist()
			const addedAuto = result.env.snapshot.inbox.filter(
				(i) => !i.resolvedAt && !beforeInbox.some((x) => x.id === i.id),
			)
			if (addedAuto[0]) void notify(addedAuto[0].title, addedAuto[0].body)
		},

		tickAutomations: async () => {
			const s = get()
			if (!s.ready || s.presence === "thinking" || s.runningAutomation) return
			const due = s.automations.find((a) => isDue(a))
			if (!due) return
			await get().runAutomation(due.id)
		},

		addAutomation: (draft: AutomationDraft) => {
			const auto = makeAutomation(draft)
			set({ automations: [auto, ...get().automations] })
			get().persist()
		},
	}
}
