import type { EnvState, Receipt } from "./types.ts"

export type ActResult = { env: EnvState; receipt: Receipt }

export type ActCtx = {
	command: string
	env: EnvState
	next: EnvState
	args: Record<string, unknown>
}

export function fail(command: string, summary: string, env: EnvState): ActResult {
	return { env, receipt: { command, ok: false, summary } }
}

export function ok(command: string, summary: string, env: EnvState, data?: unknown): ActResult {
	return { env, receipt: { command, ok: true, summary, data } }
}

export function str(args: Record<string, unknown>, key: string, fallback = ""): string {
	const v = args[key]
	return typeof v === "string" ? v : v == null ? fallback : String(v)
}

export function bool(args: Record<string, unknown>, key: string): boolean | undefined {
	const v = args[key]
	return typeof v === "boolean" ? v : undefined
}

export function parseArgs(raw: string | Record<string, unknown>): Record<string, unknown> {
	if (typeof raw === "object" && raw) return raw
	try {
		return raw ? (JSON.parse(String(raw)) as Record<string, unknown>) : {}
	} catch {
		return { text: String(raw) }
	}
}
