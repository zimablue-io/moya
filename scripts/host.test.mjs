import assert from "node:assert/strict"
import { test } from "node:test"
import { hostOsFrom, systemSettingsLabel, systemVoiceLabel } from "../src/lib/host.ts"

test("system voice label follows the OS", () => {
	assert.equal(systemVoiceLabel(hostOsFrom("", "MacIntel")), "This Mac")
	assert.equal(systemVoiceLabel(hostOsFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32")), "This PC")
	assert.equal(systemVoiceLabel(hostOsFrom("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64")), "System")
})

test("settings app name follows the OS", () => {
	assert.equal(systemSettingsLabel("mac"), "System Settings")
	assert.equal(systemSettingsLabel("windows"), "Settings")
	assert.equal(systemSettingsLabel("linux"), "System Settings")
})
