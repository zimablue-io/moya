import assert from "node:assert/strict"
import { test } from "node:test"
import { providerSetupNeeded } from "../src/lib/first-run.ts"
import { GGUF_SUGGESTIONS } from "../src/lib/gguf-catalog.ts"
import {
	hasOnDeviceLlm,
	hostOsFrom,
	isDesktopOs,
	setOnDeviceLlmAvailable,
	systemSettingsLabel,
	systemVoiceLabel,
} from "../src/lib/host.ts"
import { completeTurnMode } from "../src/lib/llm.ts"
import { providerNeedsKey } from "../src/lib/provider-models.ts"
import {
	DEFAULT_SETTINGS,
	normalizeSettings,
	providerChoicesForHost,
	providerForHost,
	settingsForHost,
	voiceChoicesForHost,
} from "../src/lib/types.ts"

test("system voice label follows the OS", () => {
	assert.equal(systemVoiceLabel(hostOsFrom("", "MacIntel")), "This Mac")
	assert.equal(systemVoiceLabel(hostOsFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32")), "This PC")
	assert.equal(systemVoiceLabel(hostOsFrom("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64")), "System")
	assert.equal(systemVoiceLabel(hostOsFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")), "System")
	assert.equal(systemVoiceLabel(hostOsFrom("Mozilla/5.0 (Linux; Android 15; Pixel 9)")), "System")
})

test("settings app name follows the OS", () => {
	assert.equal(systemSettingsLabel("mac"), "System Settings")
	assert.equal(systemSettingsLabel("windows"), "Settings")
	assert.equal(systemSettingsLabel("linux"), "System Settings")
})

test("phones and tablets are not desktop OS even when the UA mentions Mac or Linux", () => {
	assert.equal(hostOsFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iPhone"), "ios")
	assert.equal(hostOsFrom("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", "iPad"), "ios")
	assert.equal(hostOsFrom("Mozilla/5.0 (Linux; Android 15; Pixel Tablet)", "Linux armv8l"), "android")
	assert.equal(isDesktopOs("ios"), false)
	assert.equal(isDesktopOs("android"), false)
	assert.equal(isDesktopOs("mac"), true)
	assert.equal(isDesktopOs("linux"), true)
})

test("web hides localhost sidecars and on-device GGUF", () => {
	const web = providerChoicesForHost(false)
	assert.equal(web.includes("ollama"), false)
	assert.equal(web.includes("llamacpp"), false)
	assert.equal(web.includes("ondevice"), false)
	assert.equal(web.includes("custom"), true)
	assert.equal(voiceChoicesForHost(false).includes("s2s"), false)
	assert.equal(settingsForHost(DEFAULT_SETTINGS, false).voiceBackend.id, "browser")
})

test("Mac desktop keeps Ollama and llama.cpp URL, not in-process GGUF", () => {
	const desktop = providerChoicesForHost(true)
	assert.equal(desktop.includes("ollama"), true)
	assert.equal(desktop.includes("llamacpp"), true)
	assert.equal(desktop.includes("ondevice"), false)
	assert.equal(voiceChoicesForHost(true).includes("s2s"), true)
})

test("Android and iOS apps offer on-device GGUF and hide localhost sidecars", () => {
	const mobile = { desktopOs: false, onDeviceLlm: true }
	const ids = providerChoicesForHost(mobile)
	assert.equal(ids.includes("ondevice"), true)
	assert.equal(ids.includes("ollama"), false)
	assert.equal(ids.includes("llamacpp"), false)
	assert.equal(ids.includes("xai"), true)
	assert.equal(voiceChoicesForHost(mobile).includes("s2s"), false)
	assert.equal(
		providerForHost({ id: "ollama", model: "qwen3:8b", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "" }, mobile).id,
		"xai",
	)
	assert.equal(providerForHost({ id: "ondevice", model: "tiny.gguf", baseUrl: "", apiKey: "" }, false).id, "xai")
	assert.equal(providerForHost({ id: "ondevice", model: "tiny.gguf", baseUrl: "", apiKey: "" }, mobile).id, "ondevice")
})

test("completeTurn uses invoke only for ondevice", () => {
	assert.equal(completeTurnMode("ondevice"), "native")
	assert.equal(completeTurnMode("xai"), "http")
	assert.equal(completeTurnMode("llamacpp"), "http")
	assert.equal(completeTurnMode("ollama"), "http")
})

test("ondevice needs a GGUF filename and no API key", () => {
	assert.equal(providerNeedsKey("ondevice"), false)
	assert.match(providerSetupNeeded({ id: "ondevice", model: "", baseUrl: "", apiKey: "" }) ?? "", /GGUF/)
	assert.equal(
		providerSetupNeeded({ id: "ondevice", model: "Qwen_Qwen3-1.7B-Q4_K_M.gguf", baseUrl: "", apiKey: "" }),
		null,
	)
	const settings = normalizeSettings({
		provider: { id: "ondevice", model: "", baseUrl: "http://example", apiKey: "x" },
	})
	assert.equal(settings.provider.id, "ondevice")
	assert.equal(settings.provider.baseUrl, "")
	assert.equal(settings.provider.model, "")
})

test("suggested GGUFs are files the user can replace", () => {
	assert.ok(GGUF_SUGGESTIONS.some((item) => /1\.7B/i.test(item.label)))
	assert.ok(GGUF_SUGGESTIONS.some((item) => /Gemma 4 E2B/i.test(item.label)))
	assert.ok(GGUF_SUGGESTIONS.every((item) => item.filename.endsWith(".gguf") && item.url.startsWith("https://")))
})

test("hasOnDeviceLlm can be set from llm_status without treating web as native", () => {
	setOnDeviceLlmAvailable(null)
	assert.equal(hasOnDeviceLlm(), false)
	setOnDeviceLlmAvailable(true)
	assert.equal(hasOnDeviceLlm(), true)
	setOnDeviceLlmAvailable(false)
	assert.equal(hasOnDeviceLlm(), false)
	setOnDeviceLlmAvailable(null)
})
