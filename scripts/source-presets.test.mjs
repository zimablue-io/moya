import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import {
	connectArgsFromPreset,
	connectedCount,
	isSourcePresetId,
	SOURCE_CATALOG,
	SOURCE_PRESETS,
	sourceMatchesPreset,
} from "../src/lib/source-contract.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

test("Sources catalog is additive named presets, not a single provider", () => {
	assert.deepEqual(SOURCE_CATALOG, [
		"google-calendar",
		"apple-calendar",
		"outlook-calendar",
		"linear",
		"github",
		"attach",
	])
	assert.equal(SOURCE_CATALOG.includes("gmail"), false)
	assert.equal(isSourcePresetId("gmail"), false)
	assert.equal(isSourcePresetId("google-calendar"), true)
	for (const id of SOURCE_CATALOG) {
		const preset = SOURCE_PRESETS[id]
		assert.ok(preset.label)
		assert.ok(preset.hint)
		assert.notEqual(preset.exclusive, true)
	}
})

test("clicking a calendar preset always starts a new connection", () => {
	const work = connectArgsFromPreset("google-calendar", {
		name: "Work",
		origin: "https://calendar.google.com/calendar/ical/work/private/basic.ics",
	})
	const home = connectArgsFromPreset("google-calendar", {
		name: "Home",
		origin: "https://calendar.google.com/calendar/ical/home/private/basic.ics",
	})
	assert.equal(work.action, "connect")
	assert.equal(home.action, "connect")
	assert.equal(work.kind, "calendar")
	assert.equal(home.kind, "calendar")
	assert.notEqual(work.origin, home.origin)
	assert.equal(work.name, "Work")
	assert.equal(home.name, "Home")
})

test("Linear and GitHub presets fill the API origin so the user pastes a token", () => {
	const linear = connectArgsFromPreset("linear", { name: "", origin: "", authHeader: "lin_api_x" })
	assert.equal(linear.action, "connect")
	assert.equal(linear.kind, "work")
	assert.equal(linear.origin, SOURCE_PRESETS.linear.defaultOrigin)
	assert.equal(linear.authHeader, "lin_api_x")
	assert.equal(linear.name, SOURCE_PRESETS.linear.label)

	const github = connectArgsFromPreset("github", { name: "", origin: "", authHeader: "ghp_x" })
	assert.equal(github.action, "connect")
	assert.equal(github.kind, "work")
	assert.equal(github.origin, SOURCE_PRESETS.github.defaultOrigin)
	assert.equal(github.authHeader, "ghp_x")
})

test("attach is a catalog tile, not a calendar or work connect", () => {
	const draft = connectArgsFromPreset("attach", { name: "Notes", origin: "" })
	assert.equal(draft.action, "attach")
	assert.equal(draft.name, "Notes")
	assert.equal("kind" in draft, false)
})

test("connectedCount is per matching origin and stays additive", () => {
	const sources = [
		{ kind: "calendar", origin: "https://calendar.google.com/calendar/ical/a/private/basic.ics" },
		{ kind: "calendar", origin: "https://calendar.google.com/calendar/ical/b/private/basic.ics" },
		{ kind: "calendar", origin: "https://p12-caldav.icloud.com/published/2/abc" },
		{ kind: "work", origin: "https://api.linear.app/graphql" },
		{ kind: "brought", origin: "attach" },
	]
	assert.equal(connectedCount(sources, "google-calendar"), 2)
	assert.equal(connectedCount(sources, "apple-calendar"), 1)
	assert.equal(connectedCount(sources, "outlook-calendar"), 0)
	assert.equal(connectedCount(sources, "linear"), 1)
	assert.equal(connectedCount(sources, "github"), 0)
	assert.equal(connectedCount(sources, "attach"), 1)
	assert.equal(sourceMatchesPreset(sources[0], "linear"), false)
})

test("Sources settings is a catalog grid with Tooltip, not a kind Select", () => {
	const src = readFileSync(join(root, "src/components/settings-sources.tsx"), "utf8")
	assert.match(src, /SOURCE_CATALOG/)
	assert.match(src, /SOURCE_PRESETS/)
	assert.match(src, /connectArgsFromPreset/)
	assert.match(src, /connectedCount/)
	assert.match(src, /Tooltip/)
	assert.match(src, /grid-cols-3/)
	assert.equal(src.includes('from "@/components/ui/select"'), false)
	assert.equal(src.includes("<Select"), false)
	assert.equal(/Gmail/i.test(src), false)
})
