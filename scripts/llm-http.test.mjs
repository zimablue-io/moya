import assert from "node:assert/strict"
import { test } from "node:test"
import { completeHttpTurn } from "../src/lib/llm-http.ts"

function jsonResponse(body, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
		text: async () => JSON.stringify(body),
	}
}

function customProvider(baseUrl) {
	return {
		id: "custom",
		model: "MiniMax-M3",
		baseUrl,
		apiKey: "sk-test",
	}
}

async function withFetch(impl, run) {
	const prev = globalThis.fetch
	globalThis.fetch = impl
	try {
		return await run()
	} finally {
		globalThis.fetch = prev
	}
}

async function completeWithMessage(baseUrl, message) {
	return withFetch(
		async () => jsonResponse({ choices: [{ message }] }),
		() =>
			completeHttpTurn({
				provider: customProvider(baseUrl),
				messages: [{ role: "user", content: "Hi" }],
				tools: [],
			}),
	)
}

test("think tags in content are speech and thinking, not the spoken caption", async () => {
	const res = await completeWithMessage("https://api.minimax.io/v1", {
		content: "<think>plan the day</think>Hello.",
	})
	assert.equal(res.ok, true)
	assert.equal(res.content, "Hello.")
	assert.equal(res.thinking, "plan the day")
	assert.equal(res.content.includes("<think>"), false)
})

test("reasoning_content is thinking and content stays the spoken line", async () => {
	const res = await completeWithMessage("https://api.minimax.io/v1", {
		content: "Short.",
		reasoning_content: "long chain",
	})
	assert.equal(res.ok, true)
	assert.equal(res.content, "Short.")
	assert.equal(res.thinking, "long chain")
})

test("reasoning_details fill thinking when content is empty; reasoning_content wins and is not duplicated", async () => {
	const fromDetails = await completeWithMessage("https://api.minimax.io/v1", {
		content: null,
		reasoning_details: [{ text: "chain" }],
	})
	assert.equal(fromDetails.ok, true)
	assert.equal(fromDetails.content, "")
	assert.equal(fromDetails.thinking, "chain")

	const preferContent = await completeWithMessage("https://api.minimax.io/v1", {
		content: "",
		reasoning_content: "prefer me",
		reasoning_details: [{ text: "chain" }],
	})
	assert.equal(preferContent.ok, true)
	assert.equal(preferContent.content, "")
	assert.equal(preferContent.thinking, "prefer me")
	assert.equal(preferContent.thinking.includes("chain"), false)
})

test("MiniMax hosts send reasoning_split; OpenAI chat completions do not", async () => {
	const seen = []
	await withFetch(
		async (url, init) => {
			seen.push({ url: String(url), body: JSON.parse(String(init.body)) })
			return jsonResponse({ choices: [{ message: { content: "Hello." } }] })
		},
		async () => {
			await completeHttpTurn({
				provider: customProvider("https://api.minimax.io/v1"),
				messages: [{ role: "user", content: "Hi" }],
				tools: [],
			})
			await completeHttpTurn({
				provider: customProvider("https://api.minimax.cn/v1"),
				messages: [{ role: "user", content: "Hi" }],
				tools: [],
			})
			await completeHttpTurn({
				provider: {
					id: "openai",
					model: "gpt-4.1",
					baseUrl: "https://api.openai.com/v1",
					apiKey: "sk-test",
				},
				messages: [{ role: "user", content: "Hi" }],
				tools: [],
			})
		},
	)

	assert.equal(seen.length, 3)
	assert.equal(seen[0].body.reasoning_split, true)
	assert.equal(seen[1].body.reasoning_split, true)
	assert.equal("reasoning_split" in seen[2].body, false)
	assert.ok(seen[0].body.max_tokens > 900, "thinking must not consume the only 900 tokens")
	assert.ok(seen[0].body.max_completion_tokens > 900)
	assert.ok(seen[2].body.max_tokens > 900)
})

test("plain speech omits thinking", async () => {
	const res = await completeWithMessage("https://api.openai.com/v1", { content: "Hello." })
	assert.equal(res.ok, true)
	assert.equal(res.content, "Hello.")
	assert.equal("thinking" in res, false)
})
