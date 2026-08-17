import assert from "node:assert/strict"
import { test } from "node:test"
import { normalizeSnapshot } from "../src/lib/types.ts"

test("a board without items does not throw when listing items", () => {
	const snap = normalizeSnapshot({
		version: 1,
		boards: [{ id: "b1", name: "Ship", summary: "Now" }],
	})
	assert.ok(Array.isArray(snap.boards[0].items))
	assert.equal(snap.boards[0].items.length, 0)
	assert.doesNotThrow(() => [...snap.boards[0].items])
})

test("mcp tools that are not an array become an empty list", () => {
	const snap = normalizeSnapshot({
		version: 1,
		mcpServers: [{ id: "s1", name: "Local", url: "http://127.0.0.1:9", tools: { list: true } }],
	})
	assert.ok(Array.isArray(snap.mcpServers[0].tools))
	assert.equal(snap.mcpServers[0].tools.length, 0)
})

test("a stored diagram without nodes is healed on snapshot load", () => {
	const snap = normalizeSnapshot({
		version: 1,
		messages: [
			{
				id: "a1",
				role: "assistant",
				content: "I put a diagram up.",
				createdAt: "2026-01-01T00:00:00.000Z",
				artifacts: [{ type: "diagram", title: "Architecture" }],
			},
		],
	})
	const artifact = snap.messages[0].artifacts?.[0]
	assert.equal(artifact?.type, "diagram")
	assert.ok(Array.isArray(artifact.nodes))
	assert.equal(typeof artifact.nodes.length, "number")
})
