import assert from "node:assert/strict"
import { test } from "node:test"
import {
	act,
	buildCapabilityPrompt,
	catalogNames,
	catalogTools,
	compileSpeech,
	emptyEnv,
	FORBIDDEN_COMMANDS,
	isForbiddenCommand,
	parseIcsEvents,
	runQuery,
	runTurn,
} from "../src/lib/environment/index.ts"

test("forbidden commands are not in the catalog", () => {
	const names = catalogNames()
	for (const banned of FORBIDDEN_COMMANDS) {
		assert.equal(isForbiddenCommand(banned), true)
		assert.equal(names.includes(banned), false)
	}
	assert.equal(
		catalogTools().some((t) => t.function.name === "show_visual"),
		false,
	)
	assert.ok(names.includes("query"))
	assert.ok(names.includes("ui.close"))
	assert.ok(names.includes("ui.sketch"))
	assert.ok(names.includes("source.remove"))
})

test("conversation overlay is closed on the home view", () => {
	assert.equal(emptyEnv().ui.conversationOpen, false)
})

test("ui.open history opens the conversation sidebar, not a transcript dialog", async () => {
	const { env, receipt } = await act(emptyEnv(), "ui.open", { view: "history" })
	assert.equal(receipt.ok, true)
	assert.equal(env.ui.conversationOpen, true)
	assert.equal(env.ui.dialog, null)
})

test("empty projects opens an app view and does not invent an artifact", async () => {
	const { env, receipt } = await act(emptyEnv(), "ui.open", { view: "projects" })
	assert.equal(receipt.ok, true)
	assert.equal(env.ui.dialog, "watch")
	assert.equal(env.ui.watchTab, "boards")
	assert.equal(env.ui.artifact, null)
	const q = runQuery(env, { domain: "work" })
	const work = q.data.work
	assert.equal(work.empty, true)
	assert.match(work.hint, /watch list/)
	assert.equal(JSON.stringify(q.data).includes("Project A"), false)
})

test("close clears the artifact the same way for any caller", async () => {
	const sketched = await act(emptyEnv(), "ui.sketch", {
		artifact: { type: "status", title: "Fake", items: [{ label: "Project A", value: "In Review" }] },
	})
	assert.equal(sketched.env.ui.dialog, "artifact")
	assert.equal(sketched.env.ui.artifact?.grounding, "sketch")
	const closed = await act(sketched.env, "ui.close", {})
	assert.equal(closed.env.ui.artifact, null)
	assert.equal(closed.env.ui.dialog, null)
	const ui = runQuery(closed.env, { domain: "ui" }).data.ui
	assert.equal(ui.artifact, null)
})

test("query returns ids and lived.analyze uses real counts", async () => {
	let env = emptyEnv()
	const mem = await act(env, "memory.write", { kind: "fact", text: "Tea at four" })
	env = mem.env
	const q = runQuery(env, { domain: "lived" })
	assert.equal(q.data.lived.memories[0].id, mem.receipt.data.id)
	assert.equal(q.data.lived.memories[0].text, "Tea at four")
	const analyzed = await act(env, "lived.analyze", { focus: "test" })
	assert.equal(analyzed.env.ui.dialog, "watch")
	assert.equal(analyzed.env.ui.watchTab, "time")
	assert.equal(analyzed.env.ui.artifact, null)
	assert.match(analyzed.env.snapshot.insights[0].body, /Turns: 0/)
	assert.equal(analyzed.env.snapshot.insights[0].body.includes("Recurring:"), false)
})

test("forget and resolve fail without an id from query", async () => {
	const forgot = await act(emptyEnv(), "memory.forget", { text: "tea" })
	assert.equal(forgot.receipt.ok, false)
	const resolved = await act(emptyEnv(), "inbox.resolve", {})
	assert.equal(resolved.receipt.ok, false)
})

test("speech cannot claim an act that has no receipt", () => {
	assert.equal(compileSpeech([], "I resolved the inbox."), "")
	assert.equal(compileSpeech([], "Done."), "")
	assert.equal(compileSpeech([], ""), "")
	assert.equal(/i have nothing to add/i.test(compileSpeech([], "Done.")), false)
	const spoken = compileSpeech(
		[{ command: "inbox.resolve", ok: true, summary: "Resolved: Call Sam." }],
		"I resolved the inbox.",
	)
	assert.equal(spoken, "I resolved the inbox.")
})

test("an empty model turn does not invent I have nothing to add or a wrap hop", async () => {
	let hops = 0
	const result = await runTurn({
		env: emptyEnv(),
		text: "does this get used for training?",
		kind: "text",
		complete: async () => {
			hops += 1
			return { ok: true, content: "", toolCalls: [] }
		},
	})
	assert.equal(hops, 1)
	assert.equal(result.spoken, "")
	assert.equal(/i have nothing to add/i.test(result.spoken), false)
	assert.equal(
		result.env.snapshot.messages.some((m) => m.role === "assistant" && /nothing to add/i.test(m.content)),
		false,
	)
})

test("a failed model turn shows the error instead of a fake OK line", async () => {
	const result = await runTurn({
		env: emptyEnv(),
		text: "hello",
		kind: "text",
		complete: async () => ({ ok: false, error: "Model error 401" }),
	})
	assert.equal(result.error, "Model error 401")
	assert.equal(/i have nothing to add/i.test(result.spoken), false)
})

test("planning an evening is not replaced by a calendar upsell", async () => {
	const result = await runTurn({
		env: emptyEnv(),
		text: "plan my evening I have nothing on the calendar",
		kind: "text",
		complete: async (req) => {
			if (req.tools.length) {
				return {
					ok: true,
					content: "Cook pasta. Then a walk.",
					toolCalls: [{ id: "q1", name: "query", arguments: JSON.stringify({ domain: "calendar" }) }],
				}
			}
			return { ok: true, content: "Cook pasta. Then a walk.", toolCalls: [] }
		},
	})
	assert.match(result.spoken, /pasta/i)
	assert.equal(/Settings → Sources/i.test(result.spoken), false)
	assert.equal(/i have nothing to add/i.test(result.spoken), false)
})

test("capability prompt lets greetings skip tools and forbids the canned quiet line", () => {
	const prompt = buildCapabilityPrompt(emptyEnv())
	assert.match(prompt, /do not need tools/i)
	assert.match(prompt, /Never say you have nothing to add/)
	assert.equal(/If you did nothing, say so/i.test(prompt), false)
	assert.equal(/1–3 short sentences/.test(prompt), false)
})

test("a greeting that only queries is not spoken as I have nothing to add", async () => {
	const result = await runTurn({
		env: emptyEnv(),
		text: "hey, how are you?",
		kind: "text",
		complete: async (req) => {
			if (req.tools.length) {
				return {
					ok: true,
					content: "",
					toolCalls: [{ id: "c1", name: "query", arguments: JSON.stringify({ domain: "all", q: "how are you" }) }],
				}
			}
			return { ok: true, content: "I'm here. What do you need?", toolCalls: [] }
		},
	})
	assert.equal(/i have nothing to add/i.test(result.spoken), false)
	assert.equal(/queried/i.test(result.spoken), false)
})

test("a failed model turn keeps the error and does not say I have nothing to add", async () => {
	const result = await runTurn({
		env: emptyEnv(),
		text: "hello",
		kind: "text",
		complete: async () => ({ ok: false, error: "On-device GGUF is not available on this OS." }),
	})
	assert.equal(result.error, "On-device GGUF is not available on this OS.")
	assert.notEqual(result.spoken, "I have nothing to add.")
	assert.equal(
		result.env.snapshot.messages.some((m) => m.role === "assistant" && m.content === "I have nothing to add."),
		false,
	)
})

test("a greeting does not send the tool catalog", async () => {
	let toolCount = -1
	const result = await runTurn({
		env: emptyEnv(),
		text: "hey",
		kind: "text",
		complete: async (req) => {
			toolCount = req.tools.length
			return { ok: true, content: "Hey. I'm with you.", toolCalls: [] }
		},
	})
	assert.equal(toolCount, 0)
	assert.match(result.spoken, /hey|with you/i)
})

test("a hey that asks for work still sends tools", async () => {
	let toolCount = -1
	await runTurn({
		env: emptyEnv(),
		text: "hey create a test ticket",
		kind: "text",
		complete: async (req) => {
			toolCount = req.tools.length
			return { ok: true, content: "I can put that in the inbox.", toolCalls: [] }
		},
	})
	assert.ok(toolCount > 0)
})

test("a turn that narrates without acting does not ship Done or a fake close", async () => {
	const env = emptyEnv()
	const opened = await act(env, "ui.sketch", {
		artifact: { type: "note", title: "Nope", body: "invented" },
	})
	const result = await runTurn({
		env: opened.env,
		text: "close that",
		kind: "text",
		appendUser: true,
		complete: async () => ({ ok: true, content: "I closed that window.", toolCalls: [] }),
	})
	assert.notEqual(result.spoken, "Done.")
	assert.equal(/closed/i.test(result.spoken) && result.env.ui.artifact != null, false)
	assert.ok(result.env.ui.artifact === null || !/I closed/i.test(result.spoken))
})

test("offline remember actually writes", async () => {
	const result = await runTurn({
		env: emptyEnv(),
		text: "remember that I take tea at four",
		kind: "text",
		complete: async () => ({ ok: false, error: "Add an API key for xAI Grok in Settings." }),
	})
	assert.equal(result.env.snapshot.memories.length, 1)
	assert.match(result.env.snapshot.memories[0].text, /tea at four/)
	assert.notEqual(result.spoken, "Done.")
})

test("source.remove drops Moya's copy only and never offers disk delete", async () => {
	const attached = await act(emptyEnv(), "source.attach", {
		name: "notes",
		files: [{ name: "note.md", text: "# Hello" }],
	})
	assert.equal(attached.env.snapshot.sources.length, 1)
	const id = attached.receipt.data.id
	const removed = await act(attached.env, "source.remove", { id })
	assert.equal(removed.receipt.ok, true)
	assert.match(removed.receipt.summary, /Nothing on disk was deleted/)
	assert.equal(removed.env.snapshot.sources.length, 0)
	const banned = await act(emptyEnv(), "fs.delete", { path: "/Users/me" })
	assert.equal(banned.receipt.ok, false)
	assert.equal(catalogNames().includes("fs.delete"), false)
})

test("ICS attach is copy-on-ingest and queryable", async () => {
	const ics = [
		"BEGIN:VCALENDAR",
		"BEGIN:VEVENT",
		"UID:tea-1",
		"SUMMARY:Tea",
		"DTSTART:20260817T090000Z",
		"DTEND:20260817T100000Z",
		"END:VEVENT",
		"END:VCALENDAR",
	].join("\n")
	assert.equal(parseIcsEvents(ics)[0].title, "Tea")
	const attached = await act(emptyEnv(), "source.attach", {
		name: "cal",
		files: [{ name: "cal.ics", text: ics }],
	})
	assert.equal(attached.env.snapshot.sources[0].kind, "brought")
	assert.equal(attached.env.snapshot.sources[0].events[0].title, "Tea")
	const cal = runQuery(attached.env, { domain: "calendar" }).data.calendar
	assert.equal(cal.empty, false)
})

test("what's on today with no calendar source opens empty and names how to add one", async () => {
	const result = await runTurn({
		env: emptyEnv(),
		text: "what's on today",
		kind: "text",
		complete: async () => ({ ok: true, content: "You have lunch with Alex and a standup.", toolCalls: [] }),
	})
	assert.equal(JSON.stringify(result.env.ui.artifact ?? {}).includes("Alex"), false)
	assert.ok(result.receipts.some((r) => r.command === "query" || r.command === "ui.open"))
})

test("settings.voice writes the Kokoro id the next read will send", async () => {
	const started = emptyEnv()
	const local = await act(started, "settings.voice", { id: "s2s" })
	assert.equal(local.env.snapshot.settings.voiceBackend.voice, "af_heart")
	const { env } = await act(local.env, "settings.voice", { field: "voice", value: "af_bella" })
	assert.equal(env.snapshot.settings.voiceBackend.voice, "af_bella")
	const pocket = await act(env, "settings.voice", { field: "voice", value: "jean" })
	assert.equal(pocket.env.snapshot.settings.voiceBackend.voice, "af_heart")
})

test("settings.provider can switch to on-device and keep the GGUF path", async () => {
	const switched = await act(emptyEnv(), "settings.provider", {
		id: "ondevice",
		model: "/Users/me/models/gemma-4-E4B.gguf",
	})
	assert.equal(switched.env.snapshot.settings.provider.id, "ondevice")
	assert.equal(switched.env.snapshot.settings.provider.model, "/Users/me/models/gemma-4-E4B.gguf")
	assert.equal(switched.env.snapshot.settings.provider.baseUrl, "")
	const reset = await act(switched.env, "settings.provider", { id: "ondevice" })
	assert.equal(reset.env.snapshot.settings.provider.model, "/Users/me/models/gemma-4-E4B.gguf")
	const ondevice = reset.env.snapshot.settings.connections.find((c) => c.providerId === "ondevice")
	assert.equal(ondevice.lastModel, "/Users/me/models/gemma-4-E4B.gguf")
})

test("settings stay closed until onboarding is complete", async () => {
	const opened = await act(emptyEnv(), "ui.open", { view: "settings" })
	assert.equal(opened.receipt.ok, false)
	assert.equal(opened.env.ui.dialog, null)
	const focused = await act(emptyEnv(), "ui.focus", { field: "apiKey" })
	assert.equal(focused.receipt.ok, false)
	assert.equal(focused.env.ui.dialog, null)
})

test("ui.focus opens settings on the API key", async () => {
	const env = emptyEnv()
	env.snapshot.settings = {
		...env.snapshot.settings,
		provider: { id: "xai", model: "grok-4.5", baseUrl: "https://api.x.ai/v1", apiKey: "xai-test" },
		voiceBackend: {
			id: "custom",
			model: "grok-voice-latest",
			baseUrl: "https://api.x.ai/v1",
			apiKey: "xai-test",
			voice: "eve",
		},
		brief: "Direct. Keep household context.",
	}
	const focused = await act(env, "ui.focus", { field: "apiKey" })
	assert.equal(focused.env.ui.dialog, "settings")
	assert.equal(focused.env.ui.settingsTab, "model")
	assert.equal(focused.env.ui.focusField, "apiKey")
})

test("routine with no receipts fails honestly", async () => {
	let env = emptyEnv()
	const created = await act(env, "routine.upsert", {
		name: "Quiet scan",
		brief: "Stay quiet if nothing changed.",
	})
	env = created.env
	const id = created.receipt.data.id
	const result = await runTurn({
		env,
		text: "Run routine: Quiet scan.",
		kind: "routine",
		routineId: id,
		appendUser: false,
		complete: async () => ({ ok: true, content: "I scanned everything and resolved your inbox.", toolCalls: [] }),
	})
	assert.equal(result.spoken, "The routine produced no changes.")
	assert.equal(result.env.snapshot.inbox.length, 0)
})

test("a test turn does not claim a board jump when no tools ran", async () => {
	const result = await runTurn({
		env: emptyEnv(),
		text: "test",
		kind: "text",
		complete: async () => ({ ok: true, content: "I jumped to the board.", toolCalls: [] }),
	})
	assert.equal(/\b(board|jump(?:ed)?|open(?:ed)?)\b/i.test(result.spoken), false)
	assert.equal(result.env.ui.dialog, null)
})

test("create a test ticket without MCP does not ask the human for a function", async () => {
	const result = await runTurn({
		env: emptyEnv(),
		text: "create a test ticket",
		kind: "text",
		complete: async () => ({
			ok: true,
			content: "I don't have a function for that. Please provide a function.",
			toolCalls: [],
		}),
	})
	assert.equal(/provide a function|have a function|give me a function/i.test(result.spoken), false)
	assert.equal(/GitHub|Linear/.test(result.spoken), false)
})

test("cloud custom prompt names the host and does not claim data is local", () => {
	const env = emptyEnv()
	env.snapshot.settings.provider = {
		id: "custom",
		model: "MiniMax-M2",
		baseUrl: "https://api.minimax.io/v1",
		apiKey: "sk-test",
	}
	const prompt = buildCapabilityPrompt(env)
	assert.match(prompt, /api\.minimax\.io/)
	assert.equal(prompt.includes("Data is local"), false)
})

test("empty snapshot prompt is a household assistant, not a projects default", () => {
	const prompt = buildCapabilityPrompt(emptyEnv())
	assert.equal(/ui\.open view=projects/i.test(prompt), false)
	assert.equal(/GitHub|Linear/.test(prompt), false)
	assert.match(prompt, /household/i)
	assert.match(prompt, /inbox/i)
	assert.match(prompt, /memor/i)
	assert.match(prompt, /voice/i)
	assert.match(prompt, /\bday\b|today/i)
})

test("create a test ticket sends MCP tools when a tracker server is connected", async () => {
	const env = emptyEnv()
	env.snapshot.mcpServers = [
		{
			id: "tracker",
			name: "Tracker",
			url: "https://example.com/mcp",
			authHeader: "",
			enabled: true,
			tools: [{ name: "create_issue", description: "Create an issue", serverId: "tracker" }],
		},
	]
	let names = []
	const result = await runTurn({
		env,
		text: "create a test ticket",
		kind: "text",
		complete: async (req) => {
			names = req.tools.map((t) => t.function.name)
			return { ok: true, content: "I'll take that as an inbox item.", toolCalls: [] }
		},
	})
	assert.equal(
		names.some((n) => n.includes("create_issue")),
		true,
	)
	assert.match(result.spoken, /inbox/i)
})

test("speech cannot claim Watch opened when no tools ran", async () => {
	const result = await runTurn({
		env: emptyEnv(),
		text: "test",
		kind: "text",
		complete: async () => ({ ok: true, content: "I opened Watch.", toolCalls: [] }),
	})
	assert.equal(/\bopened\b/i.test(result.spoken), false)
})
