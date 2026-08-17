import { Pin, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/store";
import { MEMORY_KINDS, type MemoryKind } from "@/lib/types";
import { cn, formatWhen } from "@/lib/utils";

const FILTERS: { id: MemoryKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  ...MEMORY_KINDS,
];

export function MemoryDialog() {
  const dialog = useApp((s) => s.dialog);
  const openDialog = useApp((s) => s.openDialog);
  const memories = useApp((s) => s.memories);
  const addMemory = useApp((s) => s.addMemory);
  const updateMemory = useApp((s) => s.updateMemory);
  const forgetMemory = useApp((s) => s.forgetMemory);

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<MemoryKind | "all">("all");
  const [draft, setDraft] = useState("");
  const [draftKind, setDraftKind] = useState<MemoryKind>("fact");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return memories
      .filter((m) => (kind === "all" ? true : m.kind === kind))
      .filter((m) => !needle || m.text.toLowerCase().includes(needle) || m.kind.includes(needle))
      .slice()
      .sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.lastUsedAt.localeCompare(a.lastUsedAt),
      );
  }, [kind, memories, q]);

  return (
    <Dialog open={dialog === "memory"} onOpenChange={(o) => openDialog(o ? "memory" : null)}>
      <DialogContent className="grid-rows-[auto_auto_1fr_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Memory</DialogTitle>
          <DialogDescription>
            What Moya keeps. Local to this device. Pinned stays in every conversation.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setKind(f.id)}
                className={cn(
                  "h-9 rounded-full px-3 text-xs font-medium tracking-wide uppercase transition-colors",
                  kind === f.id
                    ? "bg-accent text-accent-fg"
                    : "bg-surface-2 text-muted hover:text-fg",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ScrollArea className="min-h-0 pr-2">
          {list.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              {memories.length === 0
                ? "Nothing kept yet. Add one below, or say “remember that…”"
                : "No match."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2 pb-2">
              {list.map((m) => (
                <li key={m.id} className="rounded-xl bg-surface-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{m.kind}</Badge>
                        {m.pinned ? (
                          <span className="text-[11px] tracking-wide text-muted uppercase">
                            Pinned
                          </span>
                        ) : null}
                        {m.weight > 1 ? (
                          <span className="text-[11px] text-subtle">×{m.weight}</span>
                        ) : null}
                      </div>
                      {editing === m.id ? (
                        <Textarea
                          className="mt-2"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onBlur={() => {
                            if (editText.trim()) updateMemory(m.id, { text: editText.trim() });
                            setEditing(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className="mt-1.5 w-full text-left text-sm leading-relaxed text-fg"
                          onClick={() => {
                            setEditing(m.id);
                            setEditText(m.text);
                          }}
                        >
                          {m.text}
                        </button>
                      )}
                      <p className="mt-2 text-[11px] text-subtle">{formatWhen(m.lastUsedAt)}</p>
                    </div>
                    <div className="flex shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={m.pinned ? "Unpin" : "Pin"}
                        onClick={() => updateMemory(m.id, { pinned: !m.pinned })}
                      >
                        <Pin
                          className={cn("size-4", m.pinned ? "fill-current text-fg" : "text-muted")}
                        />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Forget"
                        onClick={() => forgetMemory(m.id)}
                      >
                        <Trash2 className="size-4 text-muted" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            addMemory(draftKind, draft);
            setDraft("");
          }}
        >
          <select
            value={draftKind}
            onChange={(e) => setDraftKind(e.target.value as MemoryKind)}
            className="h-11 rounded-md border border-border bg-surface px-3 text-sm text-fg"
            aria-label="Kind"
          >
            {MEMORY_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Keep something"
            className="flex-1"
          />
          <Button type="submit" disabled={!draft.trim()}>
            <Plus className="size-4" />
            Keep
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
