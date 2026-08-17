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
