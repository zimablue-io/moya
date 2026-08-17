import { useState, type ReactNode } from "react";
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
import { EnginePanel } from "@/components/engine-panel";
import { speech } from "@/lib/speech";
import { useApp } from "@/lib/store";
import { PROVIDER_PRESETS, type ProviderId } from "@/lib/types";
import { uid } from "@/lib/utils";

export function SettingsDialog() {
  const dialog = useApp((s) => s.dialog);
  const openDialog = useApp((s) => s.openDialog);
  const settings = useApp((s) => s.settings);
  const patch = useApp((s) => s.patchSettings);
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
  const voices = typeof window === "undefined" ? [] : speech.listVoices();
  const preset = PROVIDER_PRESETS[settings.provider.id];

  return (
    <Dialog open={dialog === "settings"} onOpenChange={(o) => openDialog(o ? "settings" : null)}>
      <DialogContent className="grid-rows-[auto_1fr] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Moya — Sesotho for spirit, breath, wind. Rename the assistant if you like.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="general" className="min-h-0">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="voice">Voice</TabsTrigger>
            <TabsTrigger value="engine">Engine</TabsTrigger>
            <TabsTrigger value="mind">Mind</TabsTrigger>
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
              {authEnabled ? (
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="mb-2 text-xs text-muted">Account</p>
                  <UserButton />
                </div>
              ) : null}
            </TabsContent>
            <TabsContent value="voice" className="space-y-4">
              <Field label="Voice">
                <select
                  className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  value={settings.voiceURI}
                  onChange={(e) => patch({ voiceURI: e.target.value })}
                >
                  <option value="">System default</option>
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
            <TabsContent value="engine" className="mt-4">
              <EnginePanel />
            </TabsContent>
            <TabsContent value="mind" className="space-y-4">
              <Field label="Provider">
                <select
                  className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  value={settings.provider.id}
                  onChange={(e) => {
                    const id = e.target.value as ProviderId;
                    const next = PROVIDER_PRESETS[id];
                    setProviderField("id", id);
                    setProviderField("model", next.model);
                    setProviderField("baseUrl", next.baseUrl);
                  }}
                >
                  {(Object.keys(PROVIDER_PRESETS) as ProviderId[]).map((id) => (
                    <option key={id} value={id}>
                      {PROVIDER_PRESETS[id].label}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="text-xs text-muted">{preset.hint}</p>
              <Field label="Model">
                <Input
                  value={settings.provider.model}
                  onChange={(e) => setProviderField("model", e.target.value)}
                />
              </Field>
              <Field label="Base URL">
                <Input
                  value={settings.provider.baseUrl}
                  onChange={(e) => setProviderField("baseUrl", e.target.value)}
                />
              </Field>
              <Field label="API key (stored only on this device)">
                <Input
                  type="password"
                  autoComplete="off"
                  value={settings.provider.apiKey}
                  onChange={(e) => setProviderField("apiKey", e.target.value)}
                  placeholder={
                    settings.provider.id === "xai"
                      ? "Optional — host can supply xAI"
                      : "Required for this provider"
                  }
                />
              </Field>
              <p className="text-xs text-muted">
                Local llama.cpp is under Engine. Cloud keys stay on this device. Subscriptions can
                sit behind any OpenAI-compatible gateway.
              </p>
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
                <Button variant="danger" onClick={() => void wipe()}>
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
