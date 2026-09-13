import assert from "node:assert/strict"
import { test } from "node:test"
import { act, emptyEnv } from "../src/lib/environment/index.ts"
import { normalizeSettings } from "../src/lib/types.ts"

test("switching providers keeps each connection's API key", async () => {
	let env = emptyEnv()
	env = (await act(env, "settings.provider", { id: "openai" })).env
	env = (await act(env, "settings.provider", { field: "apiKey", value: "sk-openai" })).env
	assert.equal(env.snapshot.settings.provider.apiKey, "sk-openai")

	env = (await act(env, "settings.provider", { id: "xai" })).env
	env = (await act(env, "settings.provider", { field: "apiKey", value: "sk-xai" })).env
	assert.equal(env.snapshot.settings.provider.id, "xai")
	assert.equal(env.snapshot.settings.provider.apiKey, "sk-xai")

	env = (await act(env, "settings.provider", { id: "openai" })).env
	assert.equal(env.snapshot.settings.provider.id, "openai")
	assert.equal(env.snapshot.settings.provider.apiKey, "sk-openai")

	env = (await act(env, "settings.provider", { id: "xai" })).env
	assert.equal(env.snapshot.settings.provider.id, "xai")
	assert.equal(env.snapshot.settings.provider.apiKey, "sk-xai")
})

test("switching providers keeps keys and does not store the model on the connection", async () => {
	let env = emptyEnv()
	env = (await act(env, "settings.provider", { id: "openai" })).env
	env = (await act(env, "settings.provider", { field: "apiKey", value: "sk-openai" })).env
	env = (await act(env, "settings.provider", { field: "model", value: "gpt-4.1-mini" })).env

	env = (await act(env, "settings.provider", { id: "xai" })).env
	env = (await act(env, "settings.provider", { field: "model", value: "grok-4.5" })).env
	assert.equal(env.snapshot.settings.provider.model, "grok-4.5")

	env = (await act(env, "settings.provider", { id: "openai" })).env
	assert.equal(env.snapshot.settings.provider.id, "openai")
	assert.equal(env.snapshot.settings.provider.apiKey, "sk-openai")
	assert.notEqual(env.snapshot.settings.provider.model, "grok-4.5")
	const openai = env.snapshot.settings.connections.find((c) => c.providerId === "openai")
	assert.equal(openai?.lastModel, "")
})

test("add connection creates a second row without tying it to a model", async () => {
	let env = emptyEnv()
	env = (await act(env, "settings.connection", { add: "custom", label: "MiniMax" })).env
	const n = env.snapshot.settings.connections.length
	env = (await act(env, "settings.connection", { add: "openai", label: "OpenAI work" })).env
	assert.equal(env.snapshot.settings.connections.length, n + 1)
	assert.equal(env.snapshot.settings.provider.id, "openai")
	env = (await act(env, "settings.provider", { field: "model", value: "gpt-4.1-mini" })).env
	assert.equal(env.snapshot.settings.connections.length, n + 1)
})

test("two custom connections keep the names I gave them", async () => {
	let env = emptyEnv()
	const a = await act(env, "settings.connection", { add: "custom", label: "MiniMax" })
	assert.equal(a.receipt.ok, true)
	env = a.env
	const b = await act(env, "settings.connection", { add: "custom", label: "Home llama" })
	assert.equal(b.receipt.ok, true)
	env = b.env
	const labels = env.snapshot.settings.connections.map((c) => c.label)
	assert.equal(labels.includes("MiniMax"), true)
	assert.equal(labels.includes("Home llama"), true)
	assert.equal(labels.filter((n) => n === "Custom OpenAI-compatible").length === labels.length, false)
})

test("adding a connection without a name fails", async () => {
	const result = await act(emptyEnv(), "settings.connection", { add: "custom" })
	assert.equal(result.receipt.ok, false)
})

test("switching voice backends keeps the unused backend's API key", async () => {
	let env = emptyEnv()
	env = (await act(env, "settings.voice", { field: "apiKey", value: "sk-voice" })).env
	assert.equal(env.snapshot.settings.voiceBackend.id, "custom")
	assert.equal(env.snapshot.settings.voiceBackend.apiKey, "sk-voice")

	env = (await act(env, "settings.voice", { id: "s2s" })).env
	assert.equal(env.snapshot.settings.voiceBackend.id, "s2s")

	env = (await act(env, "settings.voice", { id: "custom" })).env
	assert.equal(env.snapshot.settings.voiceBackend.id, "custom")
	assert.equal(env.snapshot.settings.voiceBackend.apiKey, "sk-voice")
})

test("normalizeSettings of a provider snapshot without connections writes a vault and active connection", () => {
	const settings = normalizeSettings({
		provider: {
			id: "openai",
			model: "gpt-4.1",
			baseUrl: "https://api.openai.com/v1",
			apiKey: "k",
		},
	})
	assert.equal(Array.isArray(settings.connections), true)
	assert.equal(settings.connections.length, 1)
	assert.equal(settings.connections[0].providerId, "openai")
	assert.equal(settings.connections[0].apiKey, "k")
	assert.equal(settings.provider.model, "gpt-4.1")
	assert.equal(settings.activeConnectionId, settings.connections[0].id)
	assert.equal(settings.provider.id, "openai")
	assert.equal(settings.provider.apiKey, "k")
	assert.equal(Array.isArray(settings.voiceConnections), true)
	assert.equal(settings.voiceConnections.length >= 1, true)
	assert.equal(settings.activeVoiceConnectionId, settings.voiceConnections[0].id)
})
