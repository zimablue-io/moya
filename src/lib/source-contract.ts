export type SourcePresetId = "google-calendar" | "apple-calendar" | "outlook-calendar" | "linear" | "github" | "attach"

export type SourcePresetKind = "calendar" | "work" | "attach"

export type SourcePreset = {
	id: SourcePresetId
	label: string
	hint: string
	kind: SourcePresetKind
	defaultName: string
	defaultOrigin: string
	originPlaceholder: string
	authPlaceholder: string
	needsOrigin: boolean
	needsAuth: boolean
	exclusive?: false
}

export const SOURCE_PRESETS: Record<SourcePresetId, SourcePreset> = {
	"google-calendar": {
		id: "google-calendar",
		label: "Google Calendar",
		hint: "Paste the secret iCal address from Google Calendar → Settings → Integrate calendar.",
		kind: "calendar",
		defaultName: "Google Calendar",
		defaultOrigin: "",
		originPlaceholder: "https://calendar.google.com/calendar/ical/…/basic.ics",
		authPlaceholder: "",
		needsOrigin: true,
		needsAuth: false,
	},
	"apple-calendar": {
		id: "apple-calendar",
		label: "Apple Calendar",
		hint: "Publish the calendar in iCloud and paste the public webcal or https ICS URL.",
		kind: "calendar",
		defaultName: "Apple Calendar",
		defaultOrigin: "",
		originPlaceholder: "https://pXX-caldav.icloud.com/published/…",
		authPlaceholder: "",
		needsOrigin: true,
		needsAuth: false,
	},
	"outlook-calendar": {
		id: "outlook-calendar",
		label: "Outlook Calendar",
		hint: "Publish the calendar in Outlook and paste the ICS URL.",
		kind: "calendar",
		defaultName: "Outlook Calendar",
		defaultOrigin: "",
		originPlaceholder: "https://outlook.live.com/owa/calendar/…/ics",
		authPlaceholder: "",
		needsOrigin: true,
		needsAuth: false,
	},
	linear: {
		id: "linear",
		label: "Linear",
		hint: "Paste a Linear personal API key with Read. Moya only lists issues assigned to you.",
		kind: "work",
		defaultName: "Linear",
		defaultOrigin: "https://api.linear.app/graphql",
		originPlaceholder: "https://api.linear.app/graphql",
		authPlaceholder: "lin_api_…",
		needsOrigin: false,
		needsAuth: true,
	},
	github: {
		id: "github",
		label: "GitHub",
		hint: "Paste a GitHub token that can read issues assigned to you.",
		kind: "work",
		defaultName: "GitHub",
		defaultOrigin: "https://api.github.com/issues?filter=assigned&state=open",
		originPlaceholder: "https://api.github.com/issues?filter=assigned&state=open",
		authPlaceholder: "ghp_…",
		needsOrigin: false,
		needsAuth: true,
	},
	attach: {
		id: "attach",
		label: "Attach files",
		hint: "Copy notes or an ICS export into Moya. Removing the source deletes this copy only.",
		kind: "attach",
		defaultName: "Attached",
		defaultOrigin: "attach",
		originPlaceholder: "",
		authPlaceholder: "",
		needsOrigin: false,
		needsAuth: false,
	},
}

export const SOURCE_CATALOG: SourcePresetId[] = [
	"google-calendar",
	"apple-calendar",
	"outlook-calendar",
	"linear",
	"github",
	"attach",
]

const PRESET_IDS = new Set<string>(SOURCE_CATALOG)

export function isSourcePresetId(value: string): value is SourcePresetId {
	return PRESET_IDS.has(value)
}

export type ConnectDraft =
	| {
			action: "connect"
			kind: "calendar" | "work"
			name: string
			origin: string
			authHeader: string
	  }
	| { action: "attach"; name: string }

export function connectArgsFromPreset(
	id: SourcePresetId,
	fields: { name: string; origin: string; authHeader?: string },
): ConnectDraft {
	const preset = SOURCE_PRESETS[id]
	const name = fields.name.trim() || preset.defaultName
	if (preset.kind === "attach") return { action: "attach", name }
	return {
		action: "connect",
		kind: preset.kind,
		name,
		origin: fields.origin.trim() || preset.defaultOrigin,
		authHeader: fields.authHeader?.trim() ?? "",
	}
}

const ORIGIN_MATCH: Record<Exclude<SourcePresetId, "attach">, RegExp> = {
	"google-calendar": /calendar\.google|google\.com\/calendar/i,
	"apple-calendar": /icloud|caldav\.icloud|apple\.com/i,
	"outlook-calendar": /outlook\.|office\.com|office365|live\.com\/owa/i,
	linear: /linear\.app/i,
	github: /github/i,
}

export function sourceMatchesPreset(source: { kind: string; origin: string }, id: SourcePresetId): boolean {
	if (id === "attach") return source.kind === "brought"
	const preset = SOURCE_PRESETS[id]
	if (source.kind !== preset.kind) return false
	return ORIGIN_MATCH[id].test(source.origin)
}

export function connectedCount(sources: Array<{ kind: string; origin: string }>, id: SourcePresetId): number {
	return sources.filter((source) => sourceMatchesPreset(source, id)).length
}
