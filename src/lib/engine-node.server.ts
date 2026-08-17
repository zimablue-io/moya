import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, chmod, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { EngineSettings } from "./types";
import type { EngineStatus } from "./host";

const LLAMA_TAG = "b10453";

const g = globalThis as typeof globalThis & {
  __moyaLlama?: { proc: ChildProcess; port: number; log: string };
};

function homeDir() {
  return path.join(os.homedir(), ".moya");
}

function binPath() {
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(homeDir(), "bin", `llama-server${ext}`);
}

function assetForPlatform(): { file: string; unpack: "tar" | "zip" } {
  const plat = process.platform;
  const arch = process.arch;
  if (plat === "darwin" && arch === "arm64")
    return { file: `llama-${LLAMA_TAG}-bin-macos-arm64.tar.gz`, unpack: "tar" };
  if (plat === "darwin") return { file: `llama-${LLAMA_TAG}-bin-macos-x64.tar.gz`, unpack: "tar" };
  if (plat === "win32") return { file: `llama-${LLAMA_TAG}-bin-win-cpu-x64.zip`, unpack: "zip" };
  return { file: `llama-${LLAMA_TAG}-bin-ubuntu-x64.tar.gz`, unpack: "tar" };
}

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function health(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function status(): Promise<EngineStatus> {
  const binary = binPath();
  const installed = await exists(binary);
  const live = g.__moyaLlama;
  const port = live?.port ?? 8081;
  const running = Boolean(live?.proc && live.proc.exitCode === null);
  const ready = running ? await health(port) : await health(port);
  return {
    installed,
    running: running || ready,
    ready,
    port,
    pid: live?.proc.pid ?? null,
    binary,
    error: null,
    logTail: (live?.log ?? "").slice(-1200),
  };
}

export async function install(): Promise<EngineStatus> {
  const dest = binPath();
  if (await exists(dest)) return status();
  await mkdir(path.dirname(dest), { recursive: true });
  const { file, unpack } = assetForPlatform();
  const url = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/${file}`;
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    return { ...(await status()), error: `Download failed (${res.status}).` };
  }
  const archive = path.join(homeDir(), file);
  const out = createWriteStream(archive);
  await pipeline(res.body as unknown as NodeJS.ReadableStream, out);
  if (unpack === "tar") {
    await new Promise<void>((resolve, reject) => {
      const t = spawn("tar", ["-xzf", archive, "-C", homeDir()], { stdio: "ignore" });
      t.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("tar failed"))));
    });
    const found = await findServer(homeDir());
    if (!found) return { ...(await status()), error: "Archive had no llama-server." };
    if (found !== dest) {
      const { copyFile } = await import("node:fs/promises");
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(found, dest);
    }
    await chmod(dest, 0o755);
  } else {
    return { ...(await status()), error: "Unpack zip on Windows via the desktop app." };
  }
  return status();
}

async function findServer(root: string): Promise<string | null> {
  const { readdir } = await import("node:fs/promises");
  const walk = async (dir: string, depth: number): Promise<string | null> => {
    if (depth > 4) return null;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isFile() && (e.name === "llama-server" || e.name === "llama-server.exe")) return p;
      if (e.isDirectory()) {
        const hit = await walk(p, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  try {
    return await walk(root, 0);
  } catch {
    return null;
  }
}

export async function start(cfg: EngineSettings): Promise<EngineStatus> {
  const current = await status();
  if (current.ready) return current;
  if (!current.installed) {
    const inst = await install();
    if (!inst.installed) return inst;
  }
  if (g.__moyaLlama?.proc && g.__moyaLlama.proc.exitCode === null) {
    g.__moyaLlama.proc.kill();
  }
  const args = ["--port", String(cfg.port), "--ctx-size", String(cfg.ctx || 4096), "--jinja"];
  if (cfg.gpuLayers) args.push("-ngl", String(cfg.gpuLayers));
  if (cfg.threads) args.push("--threads", String(cfg.threads));
  if (cfg.modelPath.trim()) args.push("-m", cfg.modelPath.trim());
  else if (cfg.hfRepo.trim()) args.push("-hf", cfg.hfRepo.trim());
  else return { ...(await status()), error: "Set a model path or Hugging Face repo." };

  const proc = spawn(binPath(), args, { stdio: ["ignore", "pipe", "pipe"] });
  const slot = { proc, port: cfg.port, log: "" };
  g.__moyaLlama = slot;
  const onChunk = (buf: Buffer) => {
    slot.log = (slot.log + buf.toString()).slice(-8000);
  };
  proc.stdout?.on("data", onChunk);
  proc.stderr?.on("data", onChunk);
  proc.on("exit", () => {
    if (g.__moyaLlama?.proc === proc) g.__moyaLlama = undefined;
  });

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await health(cfg.port)) return status();
    if (proc.exitCode !== null) {
      return { ...(await status()), error: slot.log.slice(-400) || "llama-server exited." };
    }
  }
  return {
    ...(await status()),
    error: "Engine started but /health is not up yet. It may still be loading a model.",
  };
}

export async function stop(): Promise<EngineStatus> {
  if (g.__moyaLlama?.proc) {
    g.__moyaLlama.proc.kill();
    g.__moyaLlama = undefined;
  }
  return status();
}
