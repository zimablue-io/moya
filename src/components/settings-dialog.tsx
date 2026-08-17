import { useEffect, useState, type ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { authEnabled } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { speech } from "@/lib/speech";
import { useApp } from "@/lib/store";
import { isDesktop } from "@/lib/host";
import { allowMicrophone, mediaPermissionStatus, type MediaAuth } from "@/lib/media-permission";
import { listProviderModels } from "@/lib/llm";
import { PROVIDER_PRESETS, type ProviderId } from "@/lib/types";
import { uid } from "@/lib/utils";

export function SettingsDialog() {
  const dialog = useApp((s) => s.dialog);
  const openDialog = useApp((s) => s.openDialog);
  const settings = useApp((s) => s.settings);
  const patch = useApp((s) => s.patchSettings);
  const applyProvider = useApp((s) => s.applyProvider);
  const setProviderField = useApp((s) => s.setProviderField);
  const mcpServers = useApp((s) => s.mcpServers);
  const addMcp = useApp((s) => s.addMcp);
  const removeMcp = useApp((s) => s.removeMcp);
  const toggleMcp = useApp((s) => s.toggleMcp);
  const testMcp = useApp((s) => s.testMcp);
  const wipe = useApp((s) => s.wipe);
  const exportJson = useApp((s) => s.exportJson);
  const importJson = useApp((s) => s.importJson);

  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpAuth, setMcpAuth] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const preset = PROVIDER_PRESETS[settings.provider.id];

  useEffect(() => {
    const load = () => setVoices(speech.listVoices());
    load();
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", load);
  }, []);

  return (
    <Dialog open={dialog === "settings"} onOpenChange={(o) => openDialog(o ? "settings" : null)}>
      <DialogContent className="grid-rows-[auto_1fr] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Name, voice, and which model talks.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="general" className="min-h-0">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="voice">Voice</TabsTrigger>
            <TabsTrigger value="model">Model</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>
          <ScrollArea className="h-[min(52dvh,28rem)] pr-2">
            <TabsContent value="general" className="space-y-4">
              <Field label="Assistant name">
                <Input
                  value={settings.agentName}
                  onChange={(e) => patch({ agentName: e.target.value })}
                />
              </Field>
              <Field label="What to call you">
                <Input
                  value={settings.userName}
                  onChange={(e) => patch({ userName: e.target.value })}
                />
              </Field>
              <Field label="Standing brief">
                <Textarea
                  value={settings.brief}
                  onChange={(e) => patch({ brief: e.target.value })}
                  placeholder="How you work, what to watch, what not to do."
                />
              </Field>
              {authEnabled ? (
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="mb-2 text-xs text-muted">Account</p>
                  <UserButton />
                </div>
              ) : null}
            </TabsContent>
            <TabsContent value="voice" className="space-y-4">
              <MicAccess />
              <Row label="Speak replies">
                <Switch
                  checked={settings.autoSpeak}
                  onCheckedChange={(v) => patch({ autoSpeak: v })}
                />
              </Row>
              <Row label="Captions">
                <Switch
                  checked={settings.showCaptions}
                  onCheckedChange={(v) => patch({ showCaptions: v })}
                />
              </Row>
              <Field label="Voice">
                <select
                  className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  value={settings.voiceURI}
                  onChange={(e) => patch({ voiceURI: e.target.value })}
                >
                  <option value="">System default</option>
                  {settings.voiceURI && !voices.some((v) => v.voiceURI === settings.voiceURI) ? (
                    <option value={settings.voiceURI}>Saved voice (not in this list yet)</option>
                  ) : null}
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Rate ${settings.rate.toFixed(2)}`}>
                <Slider
                  min={0.7}
                  max={1.3}
                  step={0.05}
                  value={[settings.rate]}
                  onValueChange={([v]) => patch({ rate: v ?? 1 })}
                />
              </Field>
              <Field label={`Pitch ${settings.pitch.toFixed(2)}`}>
                <Slider
                  min={0.7}
                  max={1.3}
                  step={0.05}
                  value={[settings.pitch]}
                  onValueChange={([v]) => patch({ pitch: v ?? 1 })}
                />
              </Field>
              <p className="text-xs text-muted">
                Speech stays on-device. Hold the core to talk. Tap Voice for a live discussion. The
                bar is for transcribe, edit, send.
              </p>
            </TabsContent>
            <TabsContent value="model" className="space-y-4">
              <Field label="Provider">
                <select
                  className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  value={settings.provider.id}
                  onChange={(e) => applyProvider(e.target.value as ProviderId)}
                >
                  {(Object.keys(PROVIDER_PRESETS) as ProviderId[]).map((id) => (
                    <option key={id} value={id}>
                      {PROVIDER_PRESETS[id].label}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="text-xs text-muted">{preset.hint}</p>
              {settings.provider.id === "custom" ||
              settings.provider.id === "ollama" ||
              settings.provider.id === "llamacpp" ? (
                <Field label="Base URL">
                  <Input
                    value={settings.provider.baseUrl}
                    onChange={(e) => setProviderField("baseUrl", e.target.value)}
                  />
                </Field>
              ) : (
                <p className="text-xs text-subtle">{settings.provider.baseUrl}</p>
              )}
              {settings.provider.id === "xai" ||
              settings.provider.id === "openai" ||
              settings.provider.id === "groq" ||
              settings.provider.id === "openrouter" ||
              settings.provider.id === "custom" ? (
                <Field label="API key (stored only on this device)">
                  <Input
                    type="password"
                    autoComplete="off"
                    value={settings.provider.apiKey}
                    onChange={(e) => setProviderField("apiKey", e.target.value)}
                    placeholder={
                      settings.provider.id === "custom"
                        ? "Optional"
                        : "Required — stored only on this device"
                    }
                  />
                </Field>
              ) : null}
              <ProviderModels />
            </TabsContent>
            <TabsContent value="tools" className="space-y-4">
              <p className="text-xs text-muted">
                One assistant. Tools come from MCP servers your projects already expose. If a
                capability is missing, that is a gap in that project.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Name"
                  value={mcpName}
                  onChange={(e) => setMcpName(e.target.value)}
                />
                <Input
                  placeholder="https://host/mcp"
                  value={mcpUrl}
                  onChange={(e) => setMcpUrl(e.target.value)}
                />
                <Input
                  className="sm:col-span-2"
                  placeholder="Authorization header (optional)"
                  value={mcpAuth}
                  onChange={(e) => setMcpAuth(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                disabled={!mcpName.trim() || !mcpUrl.trim()}
                onClick={() => {
                  addMcp({
                    id: uid("mcp"),
                    name: mcpName.trim(),
                    url: mcpUrl.trim(),
                    authHeader: mcpAuth.trim(),
                    enabled: true,
                  });
                  setMcpName("");
                  setMcpUrl("");
                  setMcpAuth("");
                }}
              >
                Add server
              </Button>
              <ul className="flex flex-col gap-2">
                {mcpServers.length === 0 ? (
                  <li className="text-sm text-muted">
                    No servers yet. Built-in tools still work: memory, boards, time, inbox, visuals.
                  </li>
                ) : (
                  mcpServers.map((s) => (
                    <li key={s.id} className="rounded-xl bg-surface-2 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-fg">{s.name}</p>
                          <p className="text-xs break-all text-muted">{s.url}</p>
                          <p className="mt-1 text-xs text-subtle">
                            {s.tools.length} tools
                            {s.lastError ? ` · ${s.lastError}` : s.lastOkAt ? " · connected" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={s.enabled} onCheckedChange={() => toggleMcp(s.id)} />
                          <Button size="sm" variant="outline" onClick={() => void testMcp(s.id)}>
                            Test
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeMcp(s.id)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </TabsContent>
            <TabsContent value="data" className="space-y-4">
              <p className="text-sm text-muted">
                Transcripts, memory, boards, and keys live in a SQL database on this device. Nothing
                is stored on a Moya server.
              </p>
              <p className="text-xs text-muted">
                Export is a private backup of this device, including API keys and MCP headers. Keep
                the file to yourself.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const blob = new Blob([exportJson()], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "moya-local.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "application/json";
                    input.onchange = async () => {
                      const file = input.files?.[0];
                      if (!file) return;
                      importJson(await file.text());
                    };
                    input.click();
                  }}
                >
                  Import
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Wipe this device? Transcripts, memory, boards, and keys will be deleted.",
                      )
                    ) {
                      return;
                    }
                    void wipe();
                  }}
                >
                  Wipe this device
                </Button>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ProviderModels() {
  const provider = useApp((s) => s.settings.provider);
  const setProviderField = useApp((s) => s.setProviderField);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = (quiet: boolean) => {
      if (!quiet) setChecking(true);
      void listProviderModels({
        id: provider.id,
        model: "",
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
      }).then((result) => {
        if (cancelled) return;
        if (!quiet) setChecking(false);
        if (!result.ok) {
          setError(result.error);
          setModels(null);
          return;
        }
        setError(null);
        setModels(result.models);
        const current = useApp.getState().settings.provider.model;
        if (result.models.length && !result.models.includes(current)) {
          setProviderField("model", result.models[0] ?? "");
        }
      });
    };
    const id = window.setTimeout(() => run(false), 400);
    const poll =
      provider.id === "llamacpp" || provider.id === "ollama"
        ? window.setInterval(() => run(true), 5000)
        : undefined;
    return () => {
      cancelled = true;
      window.clearTimeout(id);
      if (poll) window.clearInterval(poll);
    };
  }, [provider.id, provider.baseUrl, provider.apiKey, setProviderField]);

  const options =
    provider.model && models && !models.includes(provider.model)
      ? [provider.model, ...models]
      : (models ?? []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className={error ? "text-xs text-alert" : "text-xs text-muted"}>
          {checking
            ? "Checking connection…"
            : error
              ? error
              : models
                ? models.length
                  ? `Connected. ${models.length} model${models.length === 1 ? "" : "s"}.`
                  : "Connected, but this provider listed no models."
                : "Not checked yet."}
        </p>
        <button
          type="button"
          className="text-xs text-muted underline decoration-border underline-offset-4"
          onClick={() => {
            setChecking(true);
            void listProviderModels({
              id: provider.id,
              model: "",
              baseUrl: provider.baseUrl,
              apiKey: provider.apiKey,
            }).then((result) => {
              setChecking(false);
              if (!result.ok) {
                setError(result.error);
                setModels(null);
                return;
              }
              setError(null);
              setModels(result.models);
              const current = useApp.getState().settings.provider.model;
              if (result.models.length && !result.models.includes(current)) {
                setProviderField("model", result.models[0] ?? "");
              }
            });
          }}
        >
          Check again
        </button>
      </div>
      <label className="grid gap-2">
        <Label>Model</Label>
        <select
          className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
          value={options.includes(provider.model) ? provider.model : ""}
          disabled={models === null || options.length === 0}
          onChange={(e) => setProviderField("model", e.target.value)}
        >
          <option value="">{checking ? "Checking…" : "Choose a model"}</option>
          {options.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function MicAccess() {
  const dialog = useApp((s) => s.dialog);
  const [auth, setAuth] = useState<MediaAuth | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (dialog !== "settings") return;
    const refresh = () => void mediaPermissionStatus().then(setAuth);
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [dialog]);

  const mic = auth?.microphone ?? "prompt";
  const speechAuth = auth?.speech ?? "prompt";
  const blocked = mic === "denied" || mic === "restricted" || speechAuth === "denied";
  const label =
    mic === "granted" && speechAuth !== "denied"
      ? "Microphone allowed"
      : blocked
        ? "Microphone blocked"
        : "Microphone not allowed yet";

  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <p className="text-sm text-fg">{label}</p>
      <p className="mt-1 text-xs text-muted">
        {isDesktop()
          ? "Allow and this Mac will ask. If you already declined, open System Settings."
          : "Allow and the browser will ask. If you already declined, use the control in the address bar."}
      </p>
      <div className="mt-3">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || (mic === "granted" && speechAuth !== "denied")}
          onClick={() => {
            setBusy(true);
            void allowMicrophone()
              .then(() => mediaPermissionStatus())
              .then(setAuth)
              .finally(() => setBusy(false));
          }}
        >
          {blocked && isDesktop() ? "Open System Settings" : "Allow microphone"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-11 items-center justify-between gap-4">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
