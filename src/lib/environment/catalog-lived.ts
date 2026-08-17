import { type CommandDef, cmd } from "./catalog-def.ts"

const KIND = { type: "string", enum: ["fact", "preference", "decision", "project", "insight"] }

export const LIVED_COMMANDS: CommandDef[] = [
	cmd(
		"memory.write",
		"Store or reinforce a durable memory. Requires kind and text.",
		{
			kind: KIND,
			text: { type: "string" },
			pinned: { type: "boolean" },
		},
		["kind", "text"],
	),
	cmd(
		"memory.update",
		"Update a memory by id from query.",
		{
			id: { type: "string" },
			text: { type: "string" },
			kind: KIND,
			pinned: { type: "boolean" },
		},
		["id"],
	),
	cmd("memory.forget", "Forget a memory. Requires an id from query.", { id: { type: "string" } }, ["id"]),
	cmd(
		"inbox.add",
		"Queue a needs-you item.",
		{
			title: { type: "string" },
			body: { type: "string" },
			severity: { type: "string", enum: ["info", "need", "urgent"] },
			source: { type: "string" },
		},
		["title", "body"],
	),
	cmd("inbox.resolve", "Resolve an inbox item. Requires an id from query.", { id: { type: "string" } }, ["id"]),
	cmd(
		"board.upsert",
		"Create a board, or update one by id from query. Name match does not overwrite.",
		{
			id: { type: "string" },
			name: { type: "string" },
			summary: { type: "string" },
			items: {
				type: "array",
				items: {
					type: "object",
					properties: {
						id: { type: "string" },
						label: { type: "string" },
						state: { type: "string", enum: ["watching", "running", "blocked", "idle", "done"] },
						note: { type: "string" },
						needsInput: { type: "boolean" },
					},
					required: ["label"],
				},
			},
		},
		["name"],
	),
	cmd(
		"board.delete",
		"Delete a local watch board. Requires an id from query. Does not touch disk or remotes.",
		{
			id: { type: "string" },
		},
		["id"],
	),
	cmd(
		"time.log",
		"Log time spent on something.",
		{
			hours: { type: "number" },
			category: { type: "string" },
			note: { type: "string" },
		},
		["hours", "category"],
	),
	cmd(
		"lived.analyze",
		"Write a local-counts insight from the transcript, inbox, and time logs. No invented themes. Opens Watch → Time.",
		{ focus: { type: "string" } },
	),
]
