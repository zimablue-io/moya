import assert from "node:assert/strict"
import { test } from "node:test"
import { liveSpokenLine, spokenLines } from "../src/lib/live-spoken.ts"

test("spokenLines splits sentences and does not keep the whole essay as one line", () => {
	assert.deepEqual(spokenLines("Cook pasta. Then a walk."), ["Cook pasta.", "Then a walk."])
	assert.deepEqual(spokenLines(""), [])
})

test("liveSpokenLine is the current sentence, not the full reply", () => {
	const text = "Hello there. Pack the towels."
	assert.equal(liveSpokenLine(text, 0), "Hello there.")
	assert.equal(liveSpokenLine(text, 50_000), "Pack the towels.")
	assert.equal(liveSpokenLine(text, 200).includes("Pack the towels"), false)
})
