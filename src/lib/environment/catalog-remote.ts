import { type CommandDef, cmd, OBJ } from "./catalog-def.ts"

export const REMOTE_COMMANDS: CommandDef[] = [
	cmd(
		"routine.upsert",
		"Create or update a local routine by id.",
		{
			id: { type: "string" },
			name: { type: "string" },
			brief: { type: "string" },
			enabled: { type: "boolean" },
			triggerType: { type: "string", enum: ["manual", "interval", "daily", "phrase"] },
			everyMinutes: { type: "number" },
			hour: { type: "number" },
			minute: { type: "number" },
			pattern: { type: "string" },
		},
		["name", "brief"],
	),
	cmd(
		"routine.update",
		"Patch a routine by id.",
		{
			id: { type: "string" },
			name: { type: "string" },
			brief: { type: "string" },
			enabled: { type: "boolean" },
		},
		["id"],
	),
	cmd("routine.remove", "Remove a local routine by id.", { id: { type: "string" } }, ["id"]),
	cmd("routine.run", "Run a routine's local commands now. Requires an id from query.", { id: { type: "string" } }, [
		"id",
	]),
	cmd(
		"mcp.add",
		"Add an MCP server as an escape hatch. Not a Source.",
		{
			id: { type: "string" },
			name: { type: "string" },
			url: { type: "string" },
			authHeader: { type: "string" },
			enabled: { type: "boolean" },
		},
		["name", "url"],
	),
	cmd("mcp.remove", "Remove an MCP server by id.", { id: { type: "string" } }, ["id"]),
	cmd("mcp.toggle", "Enable or disable an MCP server by id.", { id: { type: "string" } }, ["id"]),
	cmd("mcp.test", "Handshake an MCP server and refresh its tool list.", { id: { type: "string" } }, ["id"]),
	cmd(
		"mcp.call",
		"Call a remote MCP tool. Read whatever that server exposes; do not invent results.",
		{
			serverId: { type: "string" },
			tool: { type: "string" },
			args: { type: "object" },
		},
		["serverId", "tool"],
	),
	cmd(
		"source.attach",
		"Copy files into Moya (notes, ICS, export). Paths are dropped. source.remove deletes this copy only.",
		{
			name: { type: "string" },
			files: {
				type: "array",
				items: {
					type: "object",
					properties: { name: { type: "string" }, text: { type: "string" } },
					required: ["name", "text"],
				},
			},
		},
		["files"],
	),
	cmd(
		"source.connect",
		"Connect a read-only calendar (ICS URL) or work tracker (Linear readonly / GitHub read). Never write the remote.",
		{
			kind: { type: "string", enum: ["calendar", "work"] },
			name: { type: "string" },
			origin: { type: "string" },
			authHeader: { type: "string" },
		},
		["kind", "name", "origin"],
	),
	cmd(
		"source.remove",
		"Drop Moya's copy of a source. Does not delete files, mail, or git on disk.",
		{
			id: { type: "string" },
		},
		["id"],
	),
	cmd("source.sync", "Refresh a connected source (GET only). Requires an id from query.", { id: { type: "string" } }, [
		"id",
	]),
	{ name: "data.wipe", description: "Wipe Moya's local mind on this device. Not the user's files.", schema: OBJ },
	cmd("data.import", "Replace the local snapshot from a JSON backup string.", { raw: { type: "string" } }, ["raw"]),
]
