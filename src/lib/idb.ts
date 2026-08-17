import type { Memory, Snapshot } from "./types";
import { DEFAULT_ENGINE, DEFAULT_SETTINGS } from "./types";

const DB_NAME = "moya-local";
const DB_VERSION = 1;
const STORE = "kv";
const KEY = "snapshot";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function emptySnapshot(): Snapshot {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, provider: { ...DEFAULT_SETTINGS.provider } },
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

function migrateMemory(m: Memory): Memory {
  return { ...m, pinned: Boolean(m.pinned), weight: m.weight || 1 };
}

export async function loadSnapshot(): Promise<Snapshot> {
  try {
    const db = await openDb();
    const value = await new Promise<Snapshot | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as Snapshot | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!value || value.version !== 1) return emptySnapshot();
    return {
      ...emptySnapshot(),
      ...value,
      settings: {
        ...DEFAULT_SETTINGS,
        ...value.settings,
        provider: { ...DEFAULT_SETTINGS.provider, ...value.settings?.provider },
        engine: { ...DEFAULT_ENGINE, ...value.settings?.engine },
      },
      memories: (value.memories ?? []).map(migrateMemory),
      automations: value.automations ?? [],
    };
  } catch {
    return emptySnapshot();
  }
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(snapshot, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearSnapshot(): Promise<void> {
  await saveSnapshot(emptySnapshot());
}
