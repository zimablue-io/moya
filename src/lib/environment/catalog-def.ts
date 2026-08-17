export type CommandDef = {
	name: string
	description: string
	schema: Record<string, unknown>
}

export const OBJ = { type: "object" as const }

export function cmd(
	name: string,
	description: string,
	properties: Record<string, unknown>,
	required?: string[],
): CommandDef {
	return {
		name,
		description,
		schema: required ? { ...OBJ, properties, required } : { ...OBJ, properties },
	}
}

export const QUERY_TOOL: CommandDef = cmd(
	"query",
	"Read the local environment. Returns ids and facts. Use before acting. Domains: lived, ui, sources, transcript, calendar, work, all.",
	{
		domain: { type: "string", enum: ["lived", "ui", "sources", "transcript", "calendar", "work", "all"] },
		q: { type: "string" },
		day: { type: "string", description: "Local day key YYYY-MM-DD" },
	},
)
