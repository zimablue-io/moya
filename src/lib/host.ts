import { createServerFn } from "@tanstack/react-start";
import type { EngineSettings } from "./types";

export type EngineStatus = {
  installed: boolean;
  running: boolean;
  ready: boolean;
  port: number;
  pid: number | null;
  binary: string;
  error: string | null;
  logTail: string;
};

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function notify(title: string, body: string) {
  try {
    if (isDesktop()) {
      const mod = await import("@tauri-apps/plugin-notification");
      const granted = await mod.isPermissionGranted();
      if (!granted) {
        const p = await mod.requestPermission();
        if (p !== "granted") return;
      }
      sendTauriNote(mod, title, body);
      return;
    }
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission === "granted") new Notification(title, { body, silent: false });
  } catch {
    /* ignore */
  }
}

function sendTauriNote(
  mod: { sendNotification: (p: { title: string; body: string }) => void },
  title: string,
  body: string,
) {
  mod.sendNotification({ title, body });
}

export async function engineStatus(): Promise<EngineStatus> {
  if (isDesktop()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<EngineStatus>("engine_status");
  }
  return statusFn();
}

export async function engineInstall(): Promise<EngineStatus> {
  if (isDesktop()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<EngineStatus>("engine_install");
  }
  return installFn();
}

export async function engineStart(cfg: EngineSettings): Promise<EngineStatus> {
  if (isDesktop()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<EngineStatus>("engine_start", { cfg });
  }
  return startFn({ data: cfg });
}

export async function engineStop(): Promise<EngineStatus> {
  if (isDesktop()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<EngineStatus>("engine_stop");
  }
  return stopFn();
}

const statusFn = createServerFn({ method: "GET" }).handler(async () => {
  const node = await import("./engine-node.server");
  return node.status();
});

const installFn = createServerFn({ method: "POST" }).handler(async () => {
  const node = await import("./engine-node.server");
  return node.install();
});

const startFn = createServerFn({ method: "POST" })
  .validator((input: EngineSettings) => input)
  .handler(async ({ data }) => {
    const node = await import("./engine-node.server");
    return node.start(data);
  });

const stopFn = createServerFn({ method: "POST" }).handler(async () => {
  const node = await import("./engine-node.server");
  return node.stop();
});
