import { catalogTools, dispatch, emptyUiState } from "./environment"
import type { Artifact, Snapshot } from "./types"

export type ToolCall = { id: string; name: string; arguments: string }
export type ToolResult = { id: string; name: string; content: string; artifact?: Artifact }

export type World = {
	snapshot: Snapshot
	opened?: Artifact
}

export const BUILTIN_TOOLS = catalogTools().map((t) => ({
	name: t.function.name,
	description: t.function.description,
	inputSchema: t.function.parameters,
}))

export async function executeBuiltin(name: string, raw: string, world: World): Promise<ToolResult> {
	const { env, receipt } = await dispatch(
		{ snapshot: world.snapshot, ui: { ...emptyUiState(), artifact: world.opened ?? null } },
		name,
		raw,
	)
	world.snapshot = env.snapshot
	world.opened = env.ui.artifact ?? undefined
	return {
		id: "",
		name,
		content: receipt.summary,
		artifact: env.ui.artifact ?? undefined,
	}
}
