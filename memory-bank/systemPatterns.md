# System patterns

## One world: Environment

Turns, settings writes, and chrome go through `src/lib/environment`. The Zustand store (`src/lib/store.ts`) calls `applyAct` → `act()` → persist. Do not patch settings by mutating Zustand fields beside that path.

Commands live in `src/lib/environment/catalog-*.ts`. Forbidden names (`show_visual`, `fs.delete`, …) must stay out of the catalog.

Speech after a turn is compiled from **receipts** (`compileSpeech`). The model cannot invent live status.

## Voice contract

Single source: `src/lib/voice-contract.ts`.

| Concern | Function / copy |
| --- | --- |
| Voice-mode speaker | `conversationVoice(settings)` → `voiceBackend.voice` |
| Connect payload | `realtimeConnectFromSettings` |
| Session body | `sessionUpdateFromSettings` / `buildSessionUpdate` |
| Settings labels | `VOICE_SETTINGS_COPY` |

Local Conversation speaker is **Kokoro ids only** (`af_heart`, `af_bella`, `bm_fable`, …). `localConversationVoice()` coerces Pocket / unknown ids to `af_heart`. The sidecar has **no** `/v1/voices` (404). Do not list Pocket names in the Local picker.

Web pickers use `voiceChoicesForHost(false)` / `providerChoicesForHost(false)`. Local (`s2s`) is desktop OS, including Mac `.app`. Web and phone omit Local and remap leftover `s2s` to Grok. Ollama and llama.cpp URL are **desktop OS** (`hostCaps().desktopOs`). In-process GGUF is `ondevice` when `hostCaps().onDeviceLlm` (Mac Metal, iOS Metal, Android Vulkan). Native Open-from-disk is `hostCaps().pickGgufFromDisk` (desktop + engine — not `os === "mac"`). `liveSettings()` remaps at connect/send time. `completeTurn` uses `fetch` unless `provider.id === "ondevice"`, then `invoke("llm_complete")`. Path load is shared (`llm/paths.rs`); Windows/Linux keep the engine stub. `complete()` sizes the decode batch to `n_ctx` because Talk always sends `toolsFor()`. GGUF weights live in `LOADED` until hide-to-tray, Quit, leaving `ondevice`, or ~5 min idle. `llm_complete` loads on first turn. Close-to-tray must unload; the process stays alive.

Settings must `await` `settings.voice` before `restartVoiceIfNeeded()`. Fire-and-forget `void run()` then restart reads the old voice.

## Realtime session

`src/lib/realtime-session.ts` opens the WebSocket and sends `session.update` with `session.voice` and `session.audio.output.voice`. Playback: `ScheduledAudioQueue.flush()` must `stop()` every queued source. Leftover cancelled PCM must not play.

## Persist

`src/lib/persist.ts` — PGLite in IndexedDB (`idb://moya-mind`) when no `DATABASE_URL`; Neon when set. Settings are one JSON row. `normalizeSettings` maps stored Grok/OpenAI voice ids to Custom and keeps the endpoint. Unknown / stored `browser` becomes Custom. Local voice ids coerce to a Kokoro id.

## Auth

Better Auth at `/api/auth/*` → Grok broker (Google, X). Off on `tauri://localhost` / `tauri.localhost`. `createAuthClient` needs an `http(s)` `baseURL`. Do not rewrite `src/lib/auth/server.ts`. No `src/routes/auth/popup.tsx`.

## UI kit

`src/components/ui/*` are Base UI (or native HTML). Use `render`, not `asChild`. Label is `<label>`. Sliders take a scalar. Switch rows wrap the control in `<label>`. Beige fill is `bg-primary` / `text-primary-foreground`. Gray copy is `text-muted-foreground`. Focus is `ring-inset` (inner ring) — outset rings clip under `overflow: hidden`. Appearance is audited in a booted browser (`scripts/ui-visual.mjs`), not by grepping class names. Do not `shadcn add --overwrite` customized files; replay Moya classes from a `--dry-run` / `--diff`, and keep `ring-inset`. Calendar is `react-day-picker`, not a Radix wrapper.

## Desktop

Identifier `africa.moya`. `frontendDist` is `../dist/client`. Close-to-tray in `src-tauri/src/lib.rs` (hide + unload GGUF). Packaged app has no Node server.
