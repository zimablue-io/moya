import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  engineInstall,
  engineStart,
  engineStatus,
  engineStop,
  isDesktop,
  type EngineStatus,
} from "@/lib/host";
import { useApp } from "@/lib/store";

export function EnginePanel() {
  const engine = useApp((s) => s.settings.engine);
  const patchEngine = useApp((s) => s.patchEngine);
  const [st, setSt] = useState<EngineStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setSt(await engineStatus());
    } catch (err) {
      setSt({
        installed: false,
        running: false,
        ready: false,
        port: engine.port,
        pid: null,
        binary: "",
        error: err instanceof Error ? err.message : "Engine host unavailable.",
        logTail: "",
      });
    }
  };

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        llama.cpp runs on this machine. Moya starts <span className="text-fg">llama-server</span>{" "}
        and talks to it like any other provider. Models stay in ~/.moya.
      </p>
      <div className="flex h-11 items-center justify-between gap-4">
        <Label>Use local model</Label>
        <Switch checked={engine.useLocal} onCheckedChange={(v) => patchEngine({ useLocal: v })} />
      </div>
      <div className="flex h-11 items-center justify-between gap-4">
        <Label>Start with Moya</Label>
        <Switch checked={engine.autoStart} onCheckedChange={(v) => patchEngine({ autoStart: v })} />
      </div>
      <div className="rounded-xl bg-surface-2 p-3 text-sm">
        <p className="text-fg">
          {st?.ready
            ? "Ready"
            : st?.running
              ? "Starting…"
              : st?.installed
                ? "Installed, stopped"
                : "Not installed"}
        </p>
        {st?.binary ? <p className="mt-1 break-all text-xs text-subtle">{st.binary}</p> : null}
        {st?.error ? <p className="mt-1 text-xs text-alert">{st.error}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void engineInstall()
              .then(setSt)
              .finally(() => setBusy(false));
          }}
        >
          Install llama-server
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void engineStart(engine)
              .then(setSt)
              .finally(() => setBusy(false));
          }}
        >
          Start
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void engineStop()
              .then(setSt)
              .finally(() => setBusy(false));
          }}
        >
          Stop
        </Button>
      </div>
      <label className="grid gap-2">
        <Label>Hugging Face repo</Label>
        <Input value={engine.hfRepo} onChange={(e) => patchEngine({ hfRepo: e.target.value })} />
      </label>
      <label className="grid gap-2">
        <Label>Or local GGUF path</Label>
        <Input
          value={engine.modelPath}
          onChange={(e) => patchEngine({ modelPath: e.target.value })}
          placeholder="/path/to/model.gguf"
        />
      </label>
      <label className="grid gap-2">
        <Label>Port</Label>
        <Input
          type="number"
          value={engine.port}
          onChange={(e) => patchEngine({ port: Number(e.target.value) || 8081 })}
        />
      </label>
      <p className="text-xs text-subtle">
        {isDesktop()
          ? "Closing the window hides Moya to the tray so the engine keeps running."
          : "In the browser, the engine runs next to this preview. The desktop app is the same mind, as a window."}
      </p>
    </div>
  );
}
