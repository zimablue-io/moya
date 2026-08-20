export const APP_NAME = "Moya"

export const APP_VERSION = "0.1.0"

export const TAGLINE = "One assistant. Local first. Voice first."

/** Stable GitHub Release asset. Versioned DMGs also upload; this name does not change. */
export const DOWNLOAD_APP_ASSET = "Moya_aarch64.dmg"

/** Direct DMG. GitHub 302s to the latest file so the browser downloads instead of opening the releases page. */
export const DOWNLOAD_APP_URL = `https://github.com/zimablue-io/moya/releases/latest/download/${DOWNLOAD_APP_ASSET}`

export const COLOR = {
	bg: "#0b0b0a",
	surface: "#141413",
	surface2: "#1c1c1a",
	fg: "#eceae4",
	quiet: "#8a8780",
	subtle: "#5c5a55",
	brand: "#d4cfc4",
	ok: "#7d9a7e",
	warn: "#c4a46a",
	alert: "#c46b5a",
} as const

/** Two sans faces only. Display is not a serif. Clock uses sans + tabular-nums. */
export const FONT = {
	sans: "Ubuntu",
	display: "Bricolage Grotesque",
} as const

export function displayName(name?: string | null): string {
	const trimmed = name?.trim()
	return trimmed || APP_NAME
}

export function speakerLabel(role: string, agentName?: string | null): string {
	return role === "user" ? "You" : displayName(agentName)
}

export function voicePreviewText(name = APP_NAME): string {
	return `Hi, I'm ${name}. I'll keep notes on this device, remember what matters, and speak only when you want me to. Does this voice feel right?`
}

export const VOICE_PREVIEW_TEXT = voicePreviewText()

export function allowAppInSettings(settingsLabel: string): string {
	return `Allow ${APP_NAME} in ${settingsLabel}, then tap Voice again.`
}

export function micBlockedInSettings(settingsLabel: string): string {
	return `Mic is blocked. ${allowAppInSettings(settingsLabel)}`
}

export function speechBlockedInSettings(settingsLabel: string): string {
	return `Speech recognition is blocked. ${allowAppInSettings(settingsLabel)}`
}

export function openSettingsToAllow(settingsLabel: string): string {
	return `Open ${settingsLabel} to allow ${APP_NAME}.`
}
