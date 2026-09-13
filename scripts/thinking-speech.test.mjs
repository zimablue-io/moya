import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { buildCapabilityPrompt, emptyEnv, runTurn } from "../src/lib/environment/index.ts"
import { rowMessage } from "../src/lib/persist-rows.ts"
import { MIND_SCHEMA } from "../src/lib/persist-schema.ts"
import { isTranscriptTurn } from "../src/lib/transcript.ts"
import { normalizeSnapshot } from "../src/lib/types.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

test("runTurn stores speech on the assistant message and thinking separately", async () => {
	const result = await runTurn({
		env: emptyEnv(),
		text: "hey",
		kind: "text",
		complete: async () => ({
			ok: true,
			content: "Hello.",
			thinking: "plan the day",
			toolCalls: [],
		}),
	})
	assert.equal(result.spoken, "Hello.")
	const assistant = result.env.snapshot.messages.find((m) => m.role === "assistant")
	assert.ok(assistant)
	assert.equal(assistant.content, "Hello.")
	assert.equal(assistant.thinking, "plan the day")
	assert.equal(isTranscriptTurn(assistant), true)
	assert.equal(assistant.content.includes("plan the day"), false)
})

test("persisted assistant messages keep speech in content and thinking aside", () => {
	const msg = rowMessage({
		id: "a1",
		role: "assistant",
		content: "Hello.",
		created_at: "2026-01-01T00:00:00.000Z",
		thinking: "plan the day",
		hidden: 0,
	})
	assert.equal(msg.content, "Hello.")
	assert.equal(msg.thinking, "plan the day")
	assert.equal(isTranscriptTurn(msg), true)

	const emptyThink = rowMessage({
		id: "a2",
		role: "assistant",
		content: "Hello.",
		created_at: "2026-01-01T00:00:00.000Z",
		thinking: "",
		hidden: 0,
	})
	assert.equal("thinking" in emptyThink, false)

	const snap = normalizeSnapshot({
		messages: [
			{
				id: "a3",
				role: "assistant",
				content: "Hello.",
				createdAt: "2026-01-01T00:00:00.000Z",
				thinking: "plan the day",
			},
		],
	})
	assert.equal(snap.messages[0].content, "Hello.")
	assert.equal(snap.messages[0].thinking, "plan the day")

	assert.match(MIND_SCHEMA, /ALTER TABLE messages ADD COLUMN IF NOT EXISTS thinking TEXT/i)
})

test("typed send captions and speaks the spoken line, not thinking", () => {
	const turns = readFileSync(join(root, "src/lib/store-turns.ts"), "utf8")
	assert.match(turns, /caption: spoken/)
	assert.match(turns, /speakReply\(target, spoken/)
	assert.equal(/speakReply\([^)]*thinking/.test(turns), false)
})

test("home follow line is the current spoken words, not thinking", () => {
	const status = readFileSync(join(root, "src/components/assistant-status.tsx"), "utf8")
	assert.match(status, /liveSpokenLine/)
	assert.match(status, /presence === "speaking" && spokenAt/)
	assert.match(status, /: caption/)
	assert.equal(/<details/.test(status), false)
	assert.equal(/Thought/.test(status), false)
})

test("conversation sidebar lists turns with thought as an accordion", () => {
	const side = readFileSync(join(root, "src/components/conversation-sidebar.tsx"), "utf8")
	assert.match(side, /Conversation/)
	assert.match(side, /\{m\.content\}/)
	assert.match(side, /<details/)
	assert.match(side, /<summary[^>]*>\s*Thought\s*<\/summary>/)
	assert.match(side, /m\.thinking/)
	assert.equal(/TranscriptCalendar|Analyze|Search/.test(side), false)
})

test("home header toggles the conversation sidecar", () => {
	const header = readFileSync(join(root, "src/components/assistant-header.tsx"), "utf8")
	assert.match(header, /aria-label=\{conversationOpen \? "Hide conversation" : "Show conversation"\}/)
	assert.match(header, /conversationOpen/)
	const menu = readFileSync(join(root, "src/components/assistant-menu.tsx"), "utf8")
	assert.equal(/id: "history"/.test(menu), false)
})

test("conversation opens on the latest turn and can jump back to the bottom", () => {
	const side = readFileSync(join(root, "src/components/conversation-sidebar.tsx"), "utf8")
	assert.match(side, /MessageScrollerProvider/)
	assert.match(side, /autoScroll/)
	assert.match(side, /MessageScrollerButton/)
	assert.match(side, /Scroll to bottom/)
	assert.equal(/overflow-y-auto scroll-fade/.test(side), false)
})

test("conversation is a floating sidecar, not a split pane", () => {
	const shell = readFileSync(join(root, "src/components/assistant-shell.tsx"), "utf8")
	assert.equal(/flex-1 overflow-hidden/.test(shell), false)
	assert.match(shell, /relative isolate min-h-dvh overflow-hidden/)
	assert.equal(/conversationOpen \? <ConversationSidebar/.test(shell), false)
	assert.match(shell, /<ConversationSidebar \/>/)
	const side = readFileSync(join(root, "src/components/conversation-sidebar.tsx"), "utf8")
	assert.equal(/inset-y-0/.test(side), false)
	assert.match(side, /rounded-2xl/)
	assert.match(side, /shadow-xl/)
	assert.match(side, /transition-\[translate,opacity\]/)
	assert.match(side, /translate-x/)
	assert.match(side, /conversationOpen/)
})

test("capability prompt keeps spoken replies short and thinking off the voice", () => {
	const prompt = buildCapabilityPrompt(emptyEnv())
	assert.match(prompt, /spoken reply is a short paragraph/i)
	assert.match(prompt, /thinking is not spoken/i)
	assert.equal(/1–3 short sentences/.test(prompt), false)
	assert.equal(/Data is local/.test(prompt), false)
	assert.equal(/ui\.open view=projects/.test(prompt), false)
})
