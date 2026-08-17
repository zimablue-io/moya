import type { ChatTool } from "../llm.ts"
import { CHROME_COMMANDS } from "./catalog-chrome.ts"
import { type CommandDef, QUERY_TOOL } from "./catalog-def.ts"
import { LIVED_COMMANDS } from "./catalog-lived.ts"
import { REMOTE_COMMANDS } from "./catalog-remote.ts"
import { FORBIDDEN_COMMANDS } from "./types.ts"

export type { CommandDef } from "./catalog-def.ts"
export { QUERY_TOOL } from "./catalog-def.ts"

export const COMMANDS: CommandDef[] = [...LIVED_COMMANDS, ...CHROME_COMMANDS, ...REMOTE_COMMANDS]

export const LEGACY_COMMANDS: Record<string, string> = {
	memory_write: "memory.write",
	memory_forget: "memory.forget",
	inbox_add: "inbox.add",
	inbox_resolve: "inbox.resolve",
	board_upsert: "board.upsert",
	time_log: "time.log",
	show_visual: "ui.sketch",
	analyze_history: "lived.analyze",
	automation_upsert: "routine.upsert",
	memory_search: "query",
}

export function resolveCommandName(name: string): string {
	return LEGACY_COMMANDS[name] ?? name
}

export function catalogNames(): string[] {
	return [QUERY_TOOL.name, ...COMMANDS.map((c) => c.name)]
}

export function isKnownCommand(name: string): boolean {
	const resolved = resolveCommandName(name)
	return resolved === QUERY_TOOL.name || COMMANDS.some((c) => c.name === resolved)
}

export function isForbiddenCommand(name: string): boolean {
	return (FORBIDDEN_COMMANDS as readonly string[]).includes(name)
}

export function catalogTools(): ChatTool[] {
	return [QUERY_TOOL, ...COMMANDS].map((t) => ({
		type: "function" as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.schema,
		},
	}))
}
