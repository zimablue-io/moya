export type HostOs = "mac" | "windows" | "linux" | "other";

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function hostOsFrom(userAgent: string, platform = ""): HostOs {
  const blob = `${platform} ${userAgent}`.toLowerCase();
  if (/iphone|ipad|ipod|mac|darwin/.test(blob)) return "mac";
  if (/windows|win32|win64/.test(blob)) return "windows";
  if (/android|linux/.test(blob)) return "linux";
  return "other";
}

export function detectHostOs(): HostOs {
  if (typeof navigator === "undefined") return "other";
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
    ?.platform;
  return hostOsFrom(navigator.userAgent, `${navigator.platform} ${uaData ?? ""}`);
}

export function systemVoiceLabel(os: HostOs = detectHostOs()): string {
  if (os === "mac") return "This Mac";
  if (os === "windows") return "This PC";
  return "System";
}

export function thisDeviceLabel(os: HostOs = detectHostOs()): string {
  if (os === "mac") return "This Mac";
  if (os === "windows") return "This PC";
  return "This device";
}

export function systemSettingsLabel(os: HostOs = detectHostOs()): string {
  return os === "windows" ? "Settings" : "System Settings";
}

export function deviceNoun(os: HostOs = detectHostOs()): string {
  if (os === "mac") return "this Mac";
  if (os === "windows") return "this PC";
  return "this device";
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
