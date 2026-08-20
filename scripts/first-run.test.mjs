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
	providerSetupNeeded,
	showDownloadApp,
	voiceCloudSetupNeeded,
} from "../src/lib/first-run.ts"
import { DEFAULT_SETTINGS } from "../src/lib/types.ts"
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
	assert.match(providerSetupNeeded(DEFAULT_SETTINGS.provider) ?? "", /API key/)
	assert.equal(providerSetupNeeded({ ...DEFAULT_SETTINGS.provider, apiKey: "xai-test" }), null)
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
})

test("Voice setup is only for cloud backends without a usable key", () => {
	const empty = DEFAULT_SETTINGS
	assert.equal(voiceCloudSetupNeeded(empty.voiceBackend, empty.provider), false)
	assert.equal(voiceCloudSetupNeeded({ ...empty.voiceBackend, id: "xai", apiKey: "" }, empty.provider), true)
	assert.equal(
		voiceCloudSetupNeeded(
			{ ...empty.voiceBackend, id: "xai", apiKey: "" },
			{ ...empty.provider, id: "xai", apiKey: "xai-test" },
		),
		false,
	)
	assert.equal(voiceCloudSetupNeeded({ ...empty.voiceBackend, id: "browser", apiKey: "" }, empty.provider), false)
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

test("shell uses the first-run contract and does not convert on login", () => {
	const shell = [
		"src/components/assistant-shell.tsx",
		"src/components/assistant-status.tsx",
		"src/components/assistant-header.tsx",
		"src/components/assistant-menu.tsx",
		"src/components/setup-sheet.tsx",
		"src/components/use-first-run.ts",
	]
		.map(read)
		.join("\n")
	assert.match(shell, /isFirstRun/)
	assert.match(shell, /providerSetupNeeded/)
	assert.match(shell, /voiceCloudSetupNeeded/)
	assert.match(shell, /FIRST_RUN_LINE/)
	assert.match(shell, /FIRST_RUN_VERBS/)
	assert.match(shell, /showDownloadApp/)
	assert.match(shell, /macAppInstallUrl/)
	assert.equal(shell.includes("href={DOWNLOAD_APP_URL}"), false)
	assert.equal(shell.includes("resolveMacDownloadUrl"), false)
	assert.equal(shell.includes("DOWNLOAD_APP_ASSET"), false)
	assert.equal(shell.includes('target="_blank"'), false)
	assert.match(shell, /settings\.provider/)
	assert.match(shell, /Where should I think/)
	assert.match(shell, /providerChoicesForHost/)
	assert.match(shell, /liveSettings/)
	assert.equal(/sign in to save/i.test(shell), false)
	assert.equal(shell.includes('href="/login"'), false)
})
