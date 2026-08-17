import assert from "node:assert/strict"
import { test } from "node:test"
import { recoverFromRenderError, reloadApp } from "../src/lib/recover.ts"

test("recoverFromRenderError closes the visual that took the page down", () => {
	const next = recoverFromRenderError()
	assert.equal(next.dialog, null)
	assert.equal(next.artifact, null)
	assert.equal(next.error, null)
	assert.equal(next.composerOpen, false)
})

test("reloadApp sends the window back to home", () => {
	const calls = []
	reloadApp((url) => {
		calls.push(url)
	})
	assert.deepEqual(calls, ["/"])
})
