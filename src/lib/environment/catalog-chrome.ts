import { type CommandDef, cmd } from "./catalog-def.ts"

export const CHROME_COMMANDS: CommandDef[] = [
	cmd(
		"ui.open",
		"Open an app-owned view. Live data is rendered by the app. Views: history, watch, settings, memory, routines, projects, inbox, boards, time, calendar, menu.",
		{
			view: {
				type: "string",
				enum: [
					"history",
					"watch",
					"settings",
					"memory",
					"routines",
					"projects",
					"inbox",
					"boards",
					"time",
					"calendar",
					"menu",
				],
			},
			tab: { type: "string" },
			day: { type: "string" },
			mode: { type: "string", enum: ["list", "calendar"] },
			query: { type: "string" },
			kind: { type: "string" },
		},
		["view"],
	),
	cmd("ui.close", "Close the topmost chrome (artifact, dialog, menu, or composer). Same path as X and Escape.", {
		all: { type: "boolean", description: "Close every layer, like Escape." },
	}),
	cmd(
		"ui.focus",
		"Open a view and focus a field. Fields: agentName, userName, brief, apiKey, provider, voice.",
		{
			field: { type: "string" },
			view: { type: "string" },
			tab: { type: "string" },
		},
		["field"],
	),
	cmd(
		"ui.sketch",
		"Show a labeled sketch (diagram, mockup, hypothetical). Not live status. The chrome says sketch.",
		{
			artifact: {
				type: "object",
				properties: {
					type: { type: "string", enum: ["status", "chart", "diagram", "brief", "note", "mockup"] },
					title: { type: "string" },
					items: { type: "array" },
					series: { type: "array" },
					nodes: { type: "array" },
					edges: { type: "array" },
					body: { type: "string" },
					frames: { type: "array" },
				},
				required: ["type", "title"],
			},
		},
		["artifact"],
	),
	cmd("settings.patch", "Patch local settings the human owns.", {
		agentName: { type: "string" },
		userName: { type: "string" },
		brief: { type: "string" },
		autoSpeak: { type: "boolean" },
		voiceURI: { type: "string" },
		rate: { type: "number" },
		pitch: { type: "number" },
		showCaptions: { type: "boolean" },
	}),
	cmd("settings.provider", "Switch provider or set a provider field (model, baseUrl, apiKey).", {
		id: { type: "string" },
		field: { type: "string", enum: ["model", "baseUrl", "apiKey"] },
		value: { type: "string" },
	}),
	cmd("settings.voice", "Switch voice backend or set a voice field.", {
		id: { type: "string" },
		field: { type: "string", enum: ["model", "baseUrl", "apiKey", "voice"] },
		value: { type: "string" },
	}),
]
