import { loadSnapshot as loadLegacySnapshot } from "./idb.ts"
import {
	parseJson,
	rowAuto,
	rowBoard,
	rowInbox,
	rowInsight,
	rowMcp,
	rowMemory,
	rowMessage,
	rowTime,
} from "./persist-rows.ts"
import { MIND_SCHEMA } from "./persist-schema.ts"
import { DEFAULT_SETTINGS, normalizeSettings, normalizeSnapshot, type Snapshot, type Source } from "./types.ts"

type Pg = {
	waitReady: Promise<void>
	exec: (sql: string) => Promise<unknown>
	query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>
	transaction: <T>(fn: (tx: { exec: Pg["exec"]; query: Pg["query"] }) => Promise<T>) => Promise<T>
}

const g = globalThis as typeof globalThis & { __moyaMind?: Promise<Pg> }

async function openMind(): Promise<Pg> {
	g.__moyaMind ??= (async () => {
		const { PGlite } = await import("@electric-sql/pglite")
		const dataDir = typeof indexedDB !== "undefined" ? "idb://moya-mind" : undefined
		const pg = (dataDir ? new PGlite(dataDir) : new PGlite()) as unknown as Pg
		await pg.waitReady
		await pg.exec(MIND_SCHEMA)
		return pg
	})().catch((err) => {
		g.__moyaMind = undefined
		console.error("[moya] database open failed", err)
		throw err
	})
	return g.__moyaMind
}

export function emptySnapshot(): Snapshot {
	return {
		version: 1,
		settings: {
			...DEFAULT_SETTINGS,
			provider: { ...DEFAULT_SETTINGS.provider },
			voiceBackend: { ...DEFAULT_SETTINGS.voiceBackend },
		},
		messages: [],
		memories: [],
		inbox: [],
		boards: [],
		timeLogs: [],
		insights: [],
		mcpServers: [],
		automations: [],
		sources: [],
	}
}

export async function loadSnapshot(): Promise<Snapshot> {
	try {
		const db = await openMind()
		const ready = await db.query<{ value: string }>("SELECT value FROM meta WHERE key = $1", ["ready"])
		if (!ready.rows[0]) {
			const legacy = await loadLegacySnapshot()
			const hasLegacy =
				legacy.messages.length +
					legacy.memories.length +
					legacy.inbox.length +
					legacy.boards.length +
					legacy.automations.length >
				0
			if (hasLegacy) {
				await saveSnapshot(legacy)
				return loadSnapshot()
			}
			await db.query("INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", ["ready", "1"])
			return emptySnapshot()
		}

		const settingsRow = await db.query<{ data: string }>("SELECT data FROM settings WHERE id = $1", ["default"])
		const messages = await db.query<Record<string, unknown>>("SELECT * FROM messages ORDER BY created_at ASC")
		const memories = await db.query<Record<string, unknown>>("SELECT * FROM memories")
		const inbox = await db.query<Record<string, unknown>>("SELECT * FROM inbox ORDER BY created_at DESC")
		const boards = await db.query<Record<string, unknown>>("SELECT * FROM boards ORDER BY updated_at DESC")
		const items = await db.query<Record<string, unknown>>("SELECT * FROM board_items ORDER BY sort_order ASC")
		const timeLogs = await db.query<Record<string, unknown>>("SELECT * FROM time_logs ORDER BY started_at DESC")
		const insights = await db.query<Record<string, unknown>>("SELECT * FROM insights ORDER BY created_at DESC")
		const mcp = await db.query<Record<string, unknown>>("SELECT * FROM mcp_servers")
		const autos = await db.query<Record<string, unknown>>("SELECT * FROM automations ORDER BY created_at DESC")
		let sourceRows: { rows: { data: string }[] } = { rows: [] }
		try {
			sourceRows = await db.query<{ data: string }>("SELECT data FROM sources")
		} catch {
			await db.exec(`CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, data TEXT NOT NULL)`)
		}

		return normalizeSnapshot({
			version: 1,
			settings: normalizeSettings(parseJson(settingsRow.rows[0]?.data, {})),
			messages: messages.rows.map(rowMessage),
			memories: memories.rows.map(rowMemory),
			inbox: inbox.rows.map(rowInbox),
			boards: boards.rows.map((b) => rowBoard(b, items.rows)),
			timeLogs: timeLogs.rows.map(rowTime),
			insights: insights.rows.map(rowInsight),
			mcpServers: mcp.rows.map(rowMcp),
			automations: autos.rows.map(rowAuto),
			sources: sourceRows.rows.map((r) => parseJson<Source | null>(r.data, null)).filter((s): s is Source => s != null),
		})
	} catch (err) {
		console.error("[moya] database load failed", err)
		return emptySnapshot()
	}
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
	try {
		const db = await openMind()
		await db.transaction(async (tx) => {
			await tx.exec(`
      DELETE FROM board_items; DELETE FROM boards; DELETE FROM messages; DELETE FROM memories;
      DELETE FROM inbox; DELETE FROM time_logs; DELETE FROM insights; DELETE FROM mcp_servers;
      DELETE FROM automations; DELETE FROM sources;
    `)
			await tx.query(
				"INSERT INTO settings (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
				["default", JSON.stringify(snapshot.settings)],
			)
			for (const m of snapshot.messages) {
				await tx.query(
					`INSERT INTO messages (id, role, content, created_at, emotion, artifacts, tool_name, hidden)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
					[
						m.id,
						m.role,
						m.content,
						m.createdAt,
						m.emotion ?? null,
						m.artifacts ? JSON.stringify(m.artifacts) : null,
						m.toolName ?? null,
						m.hidden ? 1 : 0,
					],
				)
			}
			for (const m of snapshot.memories) {
				await tx.query(
					`INSERT INTO memories (id, kind, text, weight, pinned, created_at, last_used_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
					[m.id, m.kind, m.text, m.weight, m.pinned ? 1 : 0, m.createdAt, m.lastUsedAt],
				)
			}
			for (const i of snapshot.inbox) {
				await tx.query(
					`INSERT INTO inbox (id, title, body, source, severity, created_at, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
					[i.id, i.title, i.body, i.source, i.severity, i.createdAt, i.resolvedAt],
				)
			}
			for (const [bi, b] of snapshot.boards.entries()) {
				await tx.query(`INSERT INTO boards (id, name, summary, updated_at) VALUES ($1,$2,$3,$4)`, [
					b.id,
					b.name,
					b.summary,
					b.updatedAt,
				])
				for (const [si, it] of (b.items ?? []).entries()) {
					await tx.query(
						`INSERT INTO board_items (id, board_id, label, state, note, needs_input, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
						[it.id, b.id, it.label, it.state, it.note, it.needsInput ? 1 : 0, si + bi * 100],
					)
				}
			}
			for (const t of snapshot.timeLogs) {
				await tx.query(`INSERT INTO time_logs (id, started_at, ended_at, category, note) VALUES ($1,$2,$3,$4,$5)`, [
					t.id,
					t.startedAt,
					t.endedAt,
					t.category,
					t.note,
				])
			}
			for (const i of snapshot.insights) {
				await tx.query(`INSERT INTO insights (id, title, body, created_at) VALUES ($1,$2,$3,$4)`, [
					i.id,
					i.title,
					i.body,
					i.createdAt,
				])
			}
			for (const s of snapshot.mcpServers) {
				await tx.query(
					`INSERT INTO mcp_servers (id, name, url, auth_header, enabled, session_id, tools, last_error, last_ok_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
					[
						s.id,
						s.name,
						s.url,
						s.authHeader,
						s.enabled ? 1 : 0,
						s.sessionId ?? null,
						JSON.stringify(s.tools ?? []),
						s.lastError ?? null,
						s.lastOkAt ?? null,
					],
				)
			}
			for (const a of snapshot.automations) {
				await tx.query(
					`INSERT INTO automations (id, name, brief, enabled, trigger, last_run_at, last_result, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
					[a.id, a.name, a.brief, a.enabled ? 1 : 0, JSON.stringify(a.trigger), a.lastRunAt, a.lastResult, a.createdAt],
				)
			}
			for (const src of snapshot.sources ?? []) {
				await tx.query("INSERT INTO sources (id, data) VALUES ($1,$2)", [src.id, JSON.stringify(src)])
			}
			await tx.query(
				"INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
				["ready", "1"],
			)
		})
	} catch (err) {
		console.error("[moya] database save failed", err)
		throw err
	}
}

export async function clearSnapshot(): Promise<void> {
	await saveSnapshot(emptySnapshot())
}
