import { loadSnapshot as loadLegacySnapshot } from "./idb";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type Automation,
  type Board,
  type InboxItem,
  type Insight,
  type McpServer,
  type Memory,
  type Message,
  type Snapshot,
  type TimeLog,
} from "./types";

type Pg = {
  waitReady: Promise<void>;
  exec: (sql: string) => Promise<unknown>;
  query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  transaction: <T>(fn: (tx: { exec: Pg["exec"]; query: Pg["query"] }) => Promise<T>) => Promise<T>;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  emotion TEXT,
  artifacts TEXT,
  tool_name TEXT,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS memories_kind_idx ON memories (kind);
CREATE INDEX IF NOT EXISTS memories_text_idx ON memories (text);
CREATE TABLE IF NOT EXISTS inbox (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL,
  severity TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS board_items (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  label TEXT NOT NULL,
  state TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  needs_input INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS time_logs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  category TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  auth_header TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  session_id TEXT,
  tools TEXT NOT NULL DEFAULT '[]',
  last_error TEXT,
  last_ok_at TEXT
);
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brief TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  trigger TEXT NOT NULL,
  last_run_at TEXT,
  last_result TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`;

const g = globalThis as typeof globalThis & { __moyaMind?: Promise<Pg> };

async function openMind(): Promise<Pg> {
  g.__moyaMind ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const dataDir = typeof indexedDB !== "undefined" ? "idb://moya-mind" : undefined;
    const pg = (dataDir ? new PGlite(dataDir) : new PGlite()) as unknown as Pg;
    await pg.waitReady;
    await pg.exec(SCHEMA);
    return pg;
  })().catch((err) => {
    g.__moyaMind = undefined;
    console.error("[moya] database open failed", err);
    throw err;
  });
  return g.__moyaMind;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function emptySnapshot(): Snapshot {
  return {
    version: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      provider: { ...DEFAULT_SETTINGS.provider },
    },
    messages: [],
    memories: [],
    inbox: [],
    boards: [],
    timeLogs: [],
    insights: [],
    mcpServers: [],
    automations: [],
  };
}

export async function loadSnapshot(): Promise<Snapshot> {
  try {
    const db = await openMind();
    const ready = await db.query<{ value: string }>("SELECT value FROM meta WHERE key = $1", [
      "ready",
    ]);
    if (!ready.rows[0]) {
      const legacy = await loadLegacySnapshot();
      const hasLegacy =
        legacy.messages.length +
          legacy.memories.length +
          legacy.inbox.length +
          legacy.boards.length +
          legacy.automations.length >
        0;
      if (hasLegacy) {
        await saveSnapshot(legacy);
        return loadSnapshot();
      }
      await db.query("INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", [
        "ready",
        "1",
      ]);
      return emptySnapshot();
    }

    const settingsRow = await db.query<{ data: string }>(
      "SELECT data FROM settings WHERE id = $1",
      ["default"],
    );
    const messages = await db.query<Record<string, unknown>>(
      "SELECT * FROM messages ORDER BY created_at ASC",
    );
    const memories = await db.query<Record<string, unknown>>("SELECT * FROM memories");
    const inbox = await db.query<Record<string, unknown>>(
      "SELECT * FROM inbox ORDER BY created_at DESC",
    );
    const boards = await db.query<Record<string, unknown>>(
      "SELECT * FROM boards ORDER BY updated_at DESC",
    );
    const items = await db.query<Record<string, unknown>>(
      "SELECT * FROM board_items ORDER BY sort_order ASC",
    );
    const timeLogs = await db.query<Record<string, unknown>>(
      "SELECT * FROM time_logs ORDER BY started_at DESC",
    );
    const insights = await db.query<Record<string, unknown>>(
      "SELECT * FROM insights ORDER BY created_at DESC",
    );
    const mcp = await db.query<Record<string, unknown>>("SELECT * FROM mcp_servers");
    const autos = await db.query<Record<string, unknown>>(
      "SELECT * FROM automations ORDER BY created_at DESC",
    );

    const boardItems = items.rows;
    return {
      version: 1,
      settings: normalizeSettings(parseJson(settingsRow.rows[0]?.data, {})),
      messages: messages.rows.map(rowMessage),
      memories: memories.rows.map(rowMemory),
      inbox: inbox.rows.map(rowInbox),
      boards: boards.rows.map((b) => rowBoard(b, boardItems)),
      timeLogs: timeLogs.rows.map(rowTime),
      insights: insights.rows.map(rowInsight),
      mcpServers: mcp.rows.map(rowMcp),
      automations: autos.rows.map(rowAuto),
    };
  } catch (err) {
    console.error("[moya] database load failed", err);
    return emptySnapshot();
  }
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  try {
    const db = await openMind();
    await db.transaction(async (tx) => {
      await tx.exec(`
      DELETE FROM board_items; DELETE FROM boards; DELETE FROM messages; DELETE FROM memories;
      DELETE FROM inbox; DELETE FROM time_logs; DELETE FROM insights; DELETE FROM mcp_servers;
      DELETE FROM automations;
    `);
      await tx.query(
        "INSERT INTO settings (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
        ["default", JSON.stringify(snapshot.settings)],
      );
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
        );
      }
      for (const m of snapshot.memories) {
        await tx.query(
          `INSERT INTO memories (id, kind, text, weight, pinned, created_at, last_used_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [m.id, m.kind, m.text, m.weight, m.pinned ? 1 : 0, m.createdAt, m.lastUsedAt],
        );
      }
      for (const i of snapshot.inbox) {
        await tx.query(
          `INSERT INTO inbox (id, title, body, source, severity, created_at, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [i.id, i.title, i.body, i.source, i.severity, i.createdAt, i.resolvedAt],
        );
      }
      for (const [bi, b] of snapshot.boards.entries()) {
        await tx.query(`INSERT INTO boards (id, name, summary, updated_at) VALUES ($1,$2,$3,$4)`, [
          b.id,
          b.name,
          b.summary,
          b.updatedAt,
        ]);
        for (const [si, it] of b.items.entries()) {
          await tx.query(
            `INSERT INTO board_items (id, board_id, label, state, note, needs_input, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [it.id, b.id, it.label, it.state, it.note, it.needsInput ? 1 : 0, si + bi * 100],
          );
        }
      }
      for (const t of snapshot.timeLogs) {
        await tx.query(
          `INSERT INTO time_logs (id, started_at, ended_at, category, note) VALUES ($1,$2,$3,$4,$5)`,
          [t.id, t.startedAt, t.endedAt, t.category, t.note],
        );
      }
      for (const i of snapshot.insights) {
        await tx.query(`INSERT INTO insights (id, title, body, created_at) VALUES ($1,$2,$3,$4)`, [
          i.id,
          i.title,
          i.body,
          i.createdAt,
        ]);
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
        );
      }
      for (const a of snapshot.automations) {
        await tx.query(
          `INSERT INTO automations (id, name, brief, enabled, trigger, last_run_at, last_result, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            a.id,
            a.name,
            a.brief,
            a.enabled ? 1 : 0,
            JSON.stringify(a.trigger),
            a.lastRunAt,
            a.lastResult,
            a.createdAt,
          ],
        );
      }
      await tx.query(
        "INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        ["ready", "1"],
      );
    });
  } catch (err) {
    console.error("[moya] database save failed", err);
    throw err;
  }
}

export async function clearSnapshot(): Promise<void> {
  await saveSnapshot(emptySnapshot());
}

function rowMessage(r: Record<string, unknown>): Message {
  return {
    id: String(r.id),
    role: r.role as Message["role"],
    content: String(r.content ?? ""),
    createdAt: String(r.created_at),
    emotion: (r.emotion as Message["emotion"]) || undefined,
    artifacts: parseJson(r.artifacts as string | null, undefined),
    toolName: (r.tool_name as string) || undefined,
    hidden: Number(r.hidden) === 1,
  };
}

function rowMemory(r: Record<string, unknown>): Memory {
  return {
    id: String(r.id),
    kind: r.kind as Memory["kind"],
    text: String(r.text ?? ""),
    weight: Number(r.weight ?? 1),
    pinned: Number(r.pinned) === 1,
    createdAt: String(r.created_at),
    lastUsedAt: String(r.last_used_at),
  };
}

function rowInbox(r: Record<string, unknown>): InboxItem {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    source: String(r.source ?? "moya"),
    severity: r.severity as InboxItem["severity"],
    createdAt: String(r.created_at),
    resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
  };
}

function rowBoard(b: Record<string, unknown>, items: Record<string, unknown>[]): Board {
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
  };
}

function rowTime(r: Record<string, unknown>): TimeLog {
  return {
    id: String(r.id),
    startedAt: String(r.started_at),
    endedAt: String(r.ended_at),
    category: String(r.category ?? "work"),
    note: String(r.note ?? ""),
  };
}

function rowInsight(r: Record<string, unknown>): Insight {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    createdAt: String(r.created_at),
  };
}

function rowMcp(r: Record<string, unknown>): McpServer {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    url: String(r.url ?? ""),
    authHeader: String(r.auth_header ?? ""),
    enabled: Number(r.enabled) === 1,
    sessionId: (r.session_id as string) || undefined,
    tools: parseJson(r.tools as string, []),
    lastError: (r.last_error as string) || undefined,
    lastOkAt: (r.last_ok_at as string) || undefined,
  };
}

function rowAuto(r: Record<string, unknown>): Automation {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    brief: String(r.brief ?? ""),
    enabled: Number(r.enabled) === 1,
    trigger: parseJson(r.trigger as string, { type: "manual" }),
    lastRunAt: r.last_run_at ? String(r.last_run_at) : null,
    lastResult: String(r.last_result ?? ""),
    createdAt: String(r.created_at),
  };
}
