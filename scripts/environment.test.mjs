import assert from "node:assert/strict"
import { test } from "node:test"
import {
	act,
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

test("empty projects opens an app view and does not invent an artifact", async () => {
	const { env, receipt } = await act(emptyEnv(), "ui.open", { view: "projects" })
	assert.equal(receipt.ok, true)
	assert.equal(env.ui.dialog, "watch")
	assert.equal(env.ui.watchTab, "boards")
	assert.equal(env.ui.artifact, null)
	const q = runQuery(env, { domain: "work" })
	const work = q.data.work
	assert.equal(work.empty, true)
	assert.match(work.hint, /Settings → Sources/)
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
	assert.equal(compileSpeech([], "I resolved the inbox."), "I have nothing to add.")
	assert.equal(compileSpeech([], "Done."), "I have nothing to add.")
	assert.equal(compileSpeech([], ""), "I have nothing to add.")
	const spoken = compileSpeech(
		[{ command: "inbox.resolve", ok: true, summary: "Resolved: Call Sam." }],
		"I resolved the inbox.",
	)
	assert.equal(spoken, "I resolved the inbox.")
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
	assert.equal(started.snapshot.settings.voiceBackend.voice, "af_heart")
	const { env } = await act(started, "settings.voice", { field: "voice", value: "af_bella" })
	assert.equal(env.snapshot.settings.voiceBackend.voice, "af_bella")
	const pocket = await act(env, "settings.voice", { field: "voice", value: "jean" })
	assert.equal(pocket.env.snapshot.settings.voiceBackend.voice, "af_heart")
})

test("ui.focus opens settings on the API key", async () => {
	const { env } = await act(emptyEnv(), "ui.focus", { field: "apiKey" })
	assert.equal(env.ui.dialog, "settings")
	assert.equal(env.ui.settingsTab, "model")
	assert.equal(env.ui.focusField, "apiKey")
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
