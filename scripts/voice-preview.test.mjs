import assert from "node:assert/strict"
import { test } from "node:test"
import { VOICE_PREVIEW_TEXT } from "../src/lib/voice-preview.ts"

test("voice preview line is a fixed spoken sample", () => {
	assert.equal(typeof VOICE_PREVIEW_TEXT, "string")
	assert.match(VOICE_PREVIEW_TEXT, /Moya/)
	assert.match(VOICE_PREVIEW_TEXT, /\?/)
	assert.ok(VOICE_PREVIEW_TEXT.length > 80)
})
