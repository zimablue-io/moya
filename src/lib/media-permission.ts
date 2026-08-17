import { isDesktop } from "./host";

export type MediaAuthState = "prompt" | "denied" | "restricted" | "granted";

export type MediaAuth = {
  microphone: MediaAuthState;
  speech: MediaAuthState;
};

export type MicFix = "allow" | "settings" | null;

export async function mediaPermissionStatus(): Promise<MediaAuth> {
  if (isDesktop()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<MediaAuth>("media_permission_status");
  }
  return webStatus();
}

export async function requestMediaPermission(): Promise<MediaAuth> {
  if (isDesktop()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<MediaAuth>("request_media_permission");
  }
  return webRequest();
}

export async function openMediaSettings(
  pane: "microphone" | "speech" = "microphone",
): Promise<void> {
  if (!isDesktop()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_media_settings", { pane });
}

export async function ensureMediaAccess(): Promise<
  { ok: true } | { ok: false; message: string; fix: MicFix }
> {
  let status = await mediaPermissionStatus();
  if (needsPrompt(status)) status = await requestMediaPermission();
  if (status.microphone === "granted" && status.speech !== "denied") return { ok: true };
  return blocked(status);
}

export async function allowMicrophone(): Promise<"granted" | "opened-settings" | "denied"> {
  const status = await mediaPermissionStatus();
  if (status.microphone === "denied" || status.speech === "denied") {
    await openMediaSettings(status.microphone === "granted" ? "speech" : "microphone");
    return "opened-settings";
  }
  const next = await requestMediaPermission();
  if (next.microphone === "granted" && next.speech !== "denied") return "granted";
  if (next.microphone === "denied" || next.speech === "denied") {
    await openMediaSettings(next.microphone === "granted" ? "speech" : "microphone");
    return "opened-settings";
  }
  return "denied";
}

function needsPrompt(status: MediaAuth): boolean {
  return (
    status.microphone === "prompt" ||
    (status.microphone === "granted" && status.speech === "prompt")
  );
}

function blocked(status: MediaAuth): { ok: false; message: string; fix: MicFix } {
  const desktop = isDesktop();
  if (status.microphone === "denied") {
    return {
      ok: false,
      message: desktop
        ? "Mic is blocked. Allow Moya in System Settings, then tap Voice again."
        : "Mic is blocked. Allow the microphone in the address bar, then try again.",
      fix: desktop ? "settings" : "allow",
    };
  }
  if (status.speech === "denied") {
    return {
      ok: false,
      message: desktop
        ? "Speech recognition is blocked. Allow Moya in System Settings, then tap Voice again."
        : "Speech recognition is blocked. Type if you need to talk.",
      fix: desktop ? "settings" : null,
    };
  }
  if (status.microphone === "restricted") {
    return { ok: false, message: "Mic is blocked on this Mac.", fix: null };
  }
  return {
    ok: false,
    message: "Mic is blocked. Type if you need to talk.",
    fix: "allow",
  };
}

export function captureDenied(): { message: string; fix: MicFix } {
  const fail = blocked({ microphone: "denied", speech: "granted" });
  return { message: fail.message, fix: fail.fix };
}

async function webStatus(): Promise<MediaAuth> {
  const microphone = await queryMic();
  return { microphone, speech: microphone };
}

async function webRequest(): Promise<MediaAuth> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { microphone: "denied", speech: "denied" };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { microphone: "granted", speech: "granted" };
  } catch {
    return { microphone: "denied", speech: "denied" };
  }
}

async function queryMic(): Promise<MediaAuthState> {
  if (!navigator.mediaDevices?.getUserMedia) return "denied";
  try {
    const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (perm.state === "granted") return "granted";
    if (perm.state === "denied") return "denied";
  } catch {
    /* Permissions API is optional */
  }
  return "prompt";
}
