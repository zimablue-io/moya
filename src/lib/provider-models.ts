export function parseOpenAiModelIds(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const rec = json as Record<string, unknown>;
  const ids: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) ids.push(value.trim());
  };
  if (Array.isArray(rec.data)) {
    for (const row of rec.data) {
      if (typeof row === "string") push(row);
      else if (row && typeof row === "object") {
        const item = row as { id?: unknown; name?: unknown };
        push(typeof item.id === "string" ? item.id : item.name);
      }
    }
  } else if (Array.isArray(rec.models)) {
    for (const row of rec.models) {
      if (typeof row === "string") push(row);
      else if (row && typeof row === "object") {
        const item = row as { id?: unknown; name?: unknown };
        push(typeof item.name === "string" ? item.name : item.id);
      }
    }
  }
  return [...new Set(ids)];
}

export function providerNeedsKey(id: string): boolean {
  return id !== "ollama" && id !== "llamacpp" && id !== "custom";
}
