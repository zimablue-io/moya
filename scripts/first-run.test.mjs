import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { DOWNLOAD_APP_URL } from "../src/lib/brand.ts"
import {
	FIRST_RUN_LINE,
	FIRST_RUN_VERBS,
	firstRunHint,
	firstRunLimit,
	isFirstRun,
	menuToolsForHost,
	onboardingNeeded,
	providerSetupNeeded,
	showDownloadApp,
	voiceCloudSetupNeeded,
} from "../src/lib/first-run.ts"
import { DEFAULT_SETTINGS, providerForHost } from "../src/lib/types.ts"
import { EXPECTED_DOWNLOAD_URL } from "./shipping-contract.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function read(rel) {
	return readFileSync(join(root, rel), "utf8")
}

test("first run is no user or assistant turns, ignoring hidden and tools", () => {
	assert.equal(isFirstRun([]), true)
	assert.equal(isFirstRun([{ role: "system", content: "hi" }]), true)
	assert.equal(isFirstRun([{ role: "user", hidden: true, content: "x" }]), true)
	assert.equal(isFirstRun([{ role: "user", content: "hello" }]), false)
	assert.equal(isFirstRun([{ role: "assistant", content: "hi" }]), false)
})

test("cold default settings cannot complete a turn", () => {
	assert.match(providerSetupNeeded(DEFAULT_SETTINGS.provider) ?? "", /GGUF/)
	assert.equal(DEFAULT_SETTINGS.provider.id, "ondevice")
	assert.match(
		providerSetupNeeded({
			id: "llamacpp",
			model: "",
			baseUrl: "http://127.0.0.1:8080/v1",
			apiKey: "",
		}) ?? "",
		/model/i,
	)
	assert.equal(
		providerSetupNeeded({
			id: "ollama",
			model: "qwen3:8b",
			baseUrl: "http://127.0.0.1:11434/v1",
			apiKey: "",
		}),
		null,
	)
	assert.match(providerSetupNeeded({ id: "ondevice", model: "", baseUrl: "", apiKey: "" }) ?? "", /Pick a GGUF/)
	assert.equal(
		providerSetupNeeded({ id: "ondevice", model: "Qwen_Qwen3-1.7B-Q4_K_M.gguf", baseUrl: "", apiKey: "" }),
		null,
	)
	assert.equal(providerForHost(DEFAULT_SETTINGS.provider, false).id, "custom")
	assert.equal(providerForHost(DEFAULT_SETTINGS.provider, { desktopOs: true, onDeviceLlm: true }).id, "ondevice")
})

test("onboarding walks provider, then voice, then soul, and Settings stays closed", () => {
	const caps = { desktopOs: true, onDeviceLlm: true, pickGgufFromDisk: true }
	assert.equal(onboardingNeeded(DEFAULT_SETTINGS, caps), "provider")
	const withGguf = {
		...DEFAULT_SETTINGS,
		provider: { id: "ondevice", model: "gemma-4-E4B-it-UD-Q4_K_XL.gguf", baseUrl: "", apiKey: "" },
	}
	assert.equal(onboardingNeeded(withGguf, caps), "voice")
	const withVoice = {
		...withGguf,
		voiceBackend: {
			id: "custom",
			model: "grok-voice-latest",
			baseUrl: "https://api.x.ai/v1",
			apiKey: "xai-test",
			voice: "eve",
		},
	}
	assert.equal(onboardingNeeded(withVoice, caps), "soul")
	const ready = { ...withVoice, brief: "Direct. Keep household context. Do not lecture." }
	assert.equal(onboardingNeeded(ready, caps), null)
})

test("Voice setup needs a Custom URL, and a key when that URL is a cloud realtime host", () => {
	const empty = DEFAULT_SETTINGS
	assert.equal(voiceCloudSetupNeeded(empty.voiceBackend, empty.provider), true)
	assert.equal(
		voiceCloudSetupNeeded(
			{ id: "custom", model: "", baseUrl: "https://api.x.ai/v1", apiKey: "", voice: "" },
			empty.provider,
		),
		true,
	)
	assert.equal(
		voiceCloudSetupNeeded(
			{ id: "custom", model: "", baseUrl: "https://api.x.ai/v1", apiKey: "", voice: "" },
			{ id: "xai", model: "grok-4.5", baseUrl: "https://api.x.ai/v1", apiKey: "xai-test" },
		),
		false,
	)
	assert.equal(
		voiceCloudSetupNeeded(
			{ id: "s2s", model: "local", baseUrl: "http://127.0.0.1:8765/v1", apiKey: "", voice: "af_heart" },
			empty.provider,
		),
		false,
	)
	assert.equal(
		voiceCloudSetupNeeded(
			{ id: "custom", model: "", baseUrl: "https://proxy.example/v1", apiKey: "", voice: "" },
			empty.provider,
		),
		false,
	)
})

test("Mac app is a web menu item that points at build-from-source, not a DMG", () => {
	assert.equal(showDownloadApp(false), true)
	assert.equal(showDownloadApp(true), false)
	assert.deepEqual(menuToolsForHost(true), ["history", "memory", "routines", "watch", "settings"])
	assert.deepEqual(menuToolsForHost(false), ["history", "memory", "routines", "watch", "settings"])
	assert.equal(DOWNLOAD_APP_URL, EXPECTED_DOWNLOAD_URL)
})

test("first-run copy names the product and the local-first tax", () => {
	assert.match(FIRST_RUN_LINE, /Household assistant/)
	assert.match(firstRunLimit(true, "mac"), /this Mac/)
	assert.match(firstRunLimit(false, "mac"), /Build the Mac app/)
	assert.match(firstRunHint(false), /starting line/)
	assert.deepEqual(
		FIRST_RUN_VERBS.map((v) => v.id),
		["talk", "remember", "today"],
	)
	assert.equal(
		FIRST_RUN_VERBS.some((v) => /poem|anything/i.test(v.label)),
		false,
	)
})

test("cold open is a three-step onboarding dialog, not Settings", () => {
	const onboard = read("src/components/setup-sheet.tsx")
	const shell = [
		"src/components/assistant-shell.tsx",
		"src/components/assistant-menu.tsx",
		"src/components/use-first-run.ts",
		"src/components/settings-dialog.tsx",
		"src/lib/environment/act-chrome.ts",
	]
		.map(read)
		.join("\n")
	assert.match(onboard, /<ModelTab/)
	assert.match(onboard, /<VoiceTab/)
	assert.equal(onboard.includes("<SystemVoicePicker"), false)
	assert.equal(/~48 GB RAM|Download Qwen|GGUFs on This Mac/i.test(onboard), false)
	assert.match(onboard, /data-onboarding-step=\{step\}/)
	assert.match(onboard, /id: "provider"/)
	assert.match(onboard, /id: "voice"/)
	assert.match(onboard, /id: "soul"/)
	assert.match(onboard, /animate-in/)
	assert.match(shell, /onboardingNeeded/)
	assert.match(read("src/components/settings-dialog.tsx"), /onboardingNeeded/)
	assert.match(read("src/lib/environment/act-chrome.ts"), /onboardingNeeded/)
	assert.match(read("src/components/assistant-menu.tsx"), /onSettings/)
	assert.match(read("src/components/use-first-run.ts"), /onboardingNeeded/)
	assert.match(read("src/components/assistant-shell.tsx"), /isFirstRun/)
	assert.match(read("src/components/settings-ondevice.tsx"), /id: "ondevice"/)
	assert.equal(/sign in to save/i.test(shell), false)
	assert.equal(shell.includes('href="/login"'), false)
})
