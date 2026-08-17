import { useMemo, useState } from "react";
import { ArtifactView } from "@/components/artifact-view";
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
import { useApp } from "@/lib/store";
import { cn, formatWhen } from "@/lib/utils";

export function HistoryDialog() {
  const dialog = useApp((s) => s.dialog);
  const openDialog = useApp((s) => s.openDialog);
  const messages = useApp((s) => s.messages);
  const send = useApp((s) => s.send);
  const [q, setQ] = useState("");
  const visible = useMemo(
    () =>
      messages.filter((m) => {
        if (m.hidden || m.role === "tool" || m.role === "system") return false;
        if (!q.trim()) return true;
        return m.content.toLowerCase().includes(q.toLowerCase());
      }),
    [messages, q],
  );

  return (
    <Dialog open={dialog === "history"} onOpenChange={(o) => openDialog(o ? "history" : null)}>
      <DialogContent className="grid-rows-[auto_auto_1fr_auto]">
        <DialogHeader>
          <DialogTitle>Transcript</DialogTitle>
          <DialogDescription>Everything said here stays on this machine.</DialogDescription>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
        <ScrollArea className="min-h-0 pr-2">
          <ol className="flex flex-col gap-3 pb-2">
            {visible.length === 0 ? (
              <li className="py-10 text-center text-sm text-muted">No turns yet.</li>
            ) : (
              visible.map((m) => (
                <li key={m.id} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] font-medium tracking-wide text-muted uppercase">
                      {m.role === "user" ? "You" : "Moya"}
                    </span>
                    <span className="text-[11px] text-subtle tabular-nums">
                      {formatWhen(m.createdAt)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "text-sm leading-relaxed",
                      m.role === "user" ? "text-fg" : "text-fg/85",
                    )}
                  >
                    {m.content}
                  </p>
                  {m.artifacts?.map((a, i) => (
                    <div key={i} className="rounded-lg bg-surface-2 p-3">
                      <ArtifactView artifact={a} />
                    </div>
                  ))}
                </li>
              ))
            )}
          </ol>
        </ScrollArea>
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => {
              openDialog(null);
              void send(
                "Analyze our full transcript. Themes, decisions, open loops, and where my time is going.",
              );
            }}
          >
            Analyze
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
