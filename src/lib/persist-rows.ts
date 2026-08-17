import {
	type Automation,
	type Board,
	type InboxItem,
	type Insight,
	type McpServer,
	type Memory,
	type Message,
	normalizeArtifacts,
	type TimeLog,
} from "./types.ts"

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback
	try {
		return JSON.parse(raw) as T
	} catch {
		return fallback
	}
}

export function rowMessage(r: Record<string, unknown>): Message {
	return {
		id: String(r.id),
		role: r.role as Message["role"],
		content: String(r.content ?? ""),
		createdAt: String(r.created_at),
		emotion: (r.emotion as Message["emotion"]) || undefined,
		artifacts: normalizeArtifacts(parseJson(r.artifacts as string | null, undefined)),
		toolName: (r.tool_name as string) || undefined,
		hidden: Number(r.hidden) === 1,
	}
}

export function rowMemory(r: Record<string, unknown>): Memory {
	return {
		id: String(r.id),
		kind: r.kind as Memory["kind"],
		text: String(r.text ?? ""),
		weight: Number(r.weight ?? 1),
		pinned: Number(r.pinned) === 1,
		createdAt: String(r.created_at),
		lastUsedAt: String(r.last_used_at),
	}
}

export function rowInbox(r: Record<string, unknown>): InboxItem {
	return {
		id: String(r.id),
		title: String(r.title ?? ""),
		body: String(r.body ?? ""),
		source: String(r.source ?? "moya"),
		severity: r.severity as InboxItem["severity"],
		createdAt: String(r.created_at),
		resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
	}
}

export function rowBoard(b: Record<string, unknown>, items: Record<string, unknown>[]): Board {
	return {
		id: String(b.id),
		name: String(b.name ?? ""),
		summary: String(b.summary ?? ""),
		updatedAt: String(b.updated_at),
		items: items
			.filter((it) => String(it.board_id) === String(b.id))
			.map((it) => ({
				id: String(it.id),
				label: String(it.label ?? ""),
				state: it.state as Board["items"][number]["state"],
				note: String(it.note ?? ""),
				needsInput: Number(it.needs_input) === 1,
			})),
	}
}

export function rowTime(r: Record<string, unknown>): TimeLog {
	return {
		id: String(r.id),
		startedAt: String(r.started_at),
		endedAt: String(r.ended_at),
		category: String(r.category ?? "work"),
		note: String(r.note ?? ""),
	}
}

export function rowInsight(r: Record<string, unknown>): Insight {
	return {
		id: String(r.id),
		title: String(r.title ?? ""),
		body: String(r.body ?? ""),
		createdAt: String(r.created_at),
	}
}

export function rowMcp(r: Record<string, unknown>): McpServer {
	const tools = parseJson(r.tools as string, [])
	return {
		id: String(r.id),
		name: String(r.name ?? ""),
		url: String(r.url ?? ""),
		authHeader: String(r.auth_header ?? ""),
		enabled: Number(r.enabled) === 1,
		sessionId: (r.session_id as string) || undefined,
		tools: Array.isArray(tools) ? tools : [],
		lastError: (r.last_error as string) || undefined,
		lastOkAt: (r.last_ok_at as string) || undefined,
	}
}

export function rowAuto(r: Record<string, unknown>): Automation {
	return {
		id: String(r.id),
		name: String(r.name ?? ""),
		brief: String(r.brief ?? ""),
		enabled: Number(r.enabled) === 1,
		trigger: parseJson(r.trigger as string, { type: "manual" }),
		lastRunAt: r.last_run_at ? String(r.last_run_at) : null,
		lastResult: String(r.last_result ?? ""),
		createdAt: String(r.created_at),
	}
}
