import assert from "node:assert/strict"
import { test } from "node:test"
import {
	activityByDay,
	dateFromLocalDayKey,
	filterByDay,
	formatSpan,
	formatTranscriptStats,
	heatDatesByLevel,
	heatLevel,
	isTranscriptTurn,
	localDayKey,
	localDayKeyFromDate,
	previewSnippet,
	tickIndexAtY,
	tickY,
	transcriptStats,
	visibleTickIndices,
} from "../src/lib/transcript.ts"

function isoAtLocal(y, m, d, h = 12, min = 0) {
	return new Date(y, m - 1, d, h, min).toISOString()
}

test("local day keys use the local calendar date, not UTC", () => {
	const late = isoAtLocal(2026, 8, 17, 23, 30)
	const next = isoAtLocal(2026, 8, 18, 0, 30)
	assert.equal(localDayKey(late), "2026-08-17")
	assert.equal(localDayKey(next), "2026-08-18")
	assert.equal(localDayKeyFromDate(new Date(2026, 7, 17)), "2026-08-17")
	assert.equal(dateFromLocalDayKey("2026-08-17").getDate(), 17)
	assert.equal(dateFromLocalDayKey("2026-08-17").getMonth(), 7)
})

test("activity counts turns per local day", () => {
	const activity = activityByDay([
		{ createdAt: isoAtLocal(2026, 8, 17, 9) },
		{ createdAt: isoAtLocal(2026, 8, 17, 18) },
		{ createdAt: isoAtLocal(2026, 8, 18, 8) },
	])
	assert.equal(activity.get("2026-08-17"), 2)
	assert.equal(activity.get("2026-08-18"), 1)
})

test("heat buckets scale against the busiest day", () => {
	assert.equal(heatLevel(0, 9), 0)
	assert.equal(heatLevel(1, 0), 0)
	assert.equal(heatLevel(1, 9), 1)
	assert.equal(heatLevel(3, 9), 1)
	assert.equal(heatLevel(4, 9), 2)
	assert.equal(heatLevel(6, 9), 2)
	assert.equal(heatLevel(7, 9), 3)
	assert.equal(heatLevel(9, 9), 3)
	assert.equal(heatLevel(1, 1), 3)
})

test("heat dates group by level", () => {
	const activity = new Map([
		["2026-08-15", 1],
		["2026-08-16", 5],
		["2026-08-17", 9],
	])
	const heat = heatDatesByLevel(activity)
	assert.equal(heat.heat1.length, 1)
	assert.equal(heat.heat2.length, 1)
	assert.equal(heat.heat3.length, 1)
	assert.equal(heat.heat3[0].getDate(), 17)
})

test("filterByDay keeps only that local day, or all when cleared", () => {
	const messages = [
		{ id: "a", createdAt: isoAtLocal(2026, 8, 17, 9) },
		{ id: "b", createdAt: isoAtLocal(2026, 8, 18, 9) },
	]
	assert.deepEqual(
		filterByDay(messages, "2026-08-17").map((m) => m.id),
		["a"],
	)
	assert.equal(filterByDay(messages, null).length, 2)
})

test("hidden tool and system turns are not transcript turns", () => {
	assert.equal(isTranscriptTurn({ role: "user" }), true)
	assert.equal(isTranscriptTurn({ role: "assistant" }), true)
	assert.equal(isTranscriptTurn({ role: "user", hidden: true }), false)
	assert.equal(isTranscriptTurn({ role: "tool" }), false)
	assert.equal(isTranscriptTurn({ role: "system" }), false)
})

test("stats count you vs moya and keep first/last stamps", () => {
	const started = isoAtLocal(2026, 8, 17, 9)
	const ended = isoAtLocal(2026, 8, 17, 11)
	const stats = transcriptStats([
		{ role: "user", createdAt: started },
		{ role: "assistant", createdAt: isoAtLocal(2026, 8, 17, 10) },
		{ role: "user", createdAt: ended },
	])
	assert.equal(stats.turns, 3)
	assert.equal(stats.you, 2)
	assert.equal(stats.moya, 1)
	assert.equal(stats.startedAt, started)
	assert.equal(stats.endedAt, ended)
	const line = formatTranscriptStats(stats)
	assert.match(line, /3 turns/)
	assert.match(line, /You 2/)
	assert.match(line, /Moya 1/)
	assert.match(line, /–/)
})

test("a single turn has no time span in the stats line", () => {
	const line = formatTranscriptStats(transcriptStats([{ role: "user", createdAt: isoAtLocal(2026, 8, 17, 9) }]))
	assert.equal(line, "1 turn · You 1 · Moya 0")
})

test("span uses times on the same day and dates across days", () => {
	const same = formatSpan(isoAtLocal(2026, 8, 17, 9), isoAtLocal(2026, 8, 17, 11, 14))
	assert.match(same, /–/)
	assert.equal(same.includes("Aug"), false)
	const across = formatSpan(isoAtLocal(2026, 8, 10, 9), isoAtLocal(2026, 8, 17, 11))
	assert.match(across, /Aug/)
})

test("preview snippet collapses whitespace and ellipsizes", () => {
	assert.equal(previewSnippet("  hello   world  "), "hello world")
	assert.equal(previewSnippet("abcdefghij", 6), "abcde…")
	assert.equal(previewSnippet("short", 80), "short")
})

test("tick hit testing maps y to the nearest message index", () => {
	assert.equal(tickIndexAtY(0, 100, 10), 0)
	assert.equal(tickIndexAtY(100, 100, 10), 9)
	assert.equal(tickIndexAtY(50, 100, 3), 1)
	assert.equal(tickIndexAtY(-10, 100, 5), 0)
	assert.equal(tickIndexAtY(0, 100, 1), 0)
	assert.equal(tickY(0, 10, 100), 0)
	assert.equal(tickY(9, 10, 100), 100)
	assert.equal(tickY(0, 1, 100), 50)
})

test("visible ticks skip overlaps but keep first and last", () => {
	const ticks = visibleTickIndices(100, 20, 4)
	assert.ok(ticks.length < 100)
	assert.equal(ticks[0], 0)
	assert.equal(ticks[ticks.length - 1], 99)
	assert.deepEqual(visibleTickIndices(3, 200, 4), [0, 1, 2])
	assert.deepEqual(visibleTickIndices(0, 200, 4), [])
})
