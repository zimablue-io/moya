import type { Settings } from "./types.ts"
import { type HostCaps, settingsForHost } from "./types-presets.ts"

export type HostOs = "mac" | "windows" | "linux" | "ios" | "android" | "other"

/** Native Tauri webview (Mac .app, Android APK, iOS IPA). Not the same as a desktop OS. */
export function isTauri(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

/**
 * Native shell. Mic, notifications, and “download the Mac app” use this.
 * Sidecar pickers must use `isDesktopOs()` / `hostCaps()` instead — a phone
 * webview is Tauri but must not offer Ollama or llama.cpp-as-localhost.
 */
export function isDesktop(): boolean {
	return isTauri()
}

export function isDesktopOs(os: HostOs = detectHostOs()): boolean {
	return os === "mac" || os === "windows" || os === "linux"
}

let onDeviceOverride: boolean | null = null

/** Test/native hook. `llm_status.available` writes this; tests may reset it. */
export function setOnDeviceLlmAvailable(value: boolean | null) {
	onDeviceOverride = value
}

/** True when this native app can run in-process llama.cpp (phone/tablet). Never web or Mac. */
export function hasOnDeviceLlm(): boolean {
	if (onDeviceOverride != null) return onDeviceOverride
	return isTauri() && !isDesktopOs()
}

export function hostCaps(): HostCaps {
	const tauri = isTauri()
	const desktopOs = isDesktopOs()
	return {
		desktopOs: tauri && desktopOs,
		onDeviceLlm: hasOnDeviceLlm(),
	}
}

/** Settings as this host should use them. Does not write. Desktop OS keeps Local / Ollama / llama.cpp. */
export function liveSettings(settings: Settings): Settings {
	return settingsForHost(settings, hostCaps())
}

export function hostOsFrom(userAgent: string, platform = ""): HostOs {
	const blob = `${platform} ${userAgent}`.toLowerCase()
	if (/iphone|ipad|ipod/.test(blob)) return "ios"
	if (/android/.test(blob)) return "android"
	if (/mac|darwin/.test(blob)) return "mac"
	if (/windows|win32|win64/.test(blob)) return "windows"
	if (/linux/.test(blob)) return "linux"
	return "other"
}

export function detectHostOs(): HostOs {
	if (typeof navigator === "undefined") return "other"
	const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
	return hostOsFrom(navigator.userAgent, `${navigator.platform} ${uaData ?? ""}`)
}

export function systemVoiceLabel(os: HostOs = detectHostOs()): string {
	if (os === "mac") return "This Mac"
	if (os === "windows") return "This PC"
	return "System"
}

export function thisDeviceLabel(os: HostOs = detectHostOs()): string {
	if (os === "mac") return "This Mac"
	if (os === "windows") return "This PC"
	return "This device"
}

export function systemSettingsLabel(os: HostOs = detectHostOs()): string {
	return os === "windows" ? "Settings" : "System Settings"
}

export function deviceNoun(os: HostOs = detectHostOs()): string {
	if (os === "mac") return "this Mac"
	if (os === "windows") return "this PC"
	return "this device"
}

export async function notify(title: string, body: string) {
	try {
		if (isTauri()) {
			const mod = await import("@tauri-apps/plugin-notification")
			const granted = await mod.isPermissionGranted()
			if (!granted) {
				const p = await mod.requestPermission()
				if (p !== "granted") return
			}
			sendTauriNote(mod, title, body)
			return
		}
		if (typeof Notification === "undefined") return
		if (Notification.permission === "default") await Notification.requestPermission()
		if (Notification.permission === "granted") new Notification(title, { body, silent: false })
	} catch {
		/* ignore */
	}
}

function sendTauriNote(
	mod: { sendNotification: (p: { title: string; body: string }) => void },
	title: string,
	body: string,
) {
	mod.sendNotification({ title, body })
}
