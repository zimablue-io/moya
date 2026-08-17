export function resolveAuthClientConfig(origin: string | undefined): {
  enabled: boolean;
  baseURL: string | undefined;
} {
  if (!origin) {
    return { enabled: true, baseURL: undefined };
  }

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return { enabled: false, baseURL: "http://127.0.0.1:8080" };
  }

  const http = url.protocol === "http:" || url.protocol === "https:";
  if (!http || url.hostname === "tauri.localhost") {
    return { enabled: false, baseURL: http ? origin : "http://127.0.0.1:8080" };
  }

  return { enabled: true, baseURL: undefined };
}
