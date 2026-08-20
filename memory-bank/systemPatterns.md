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
| Typed-reply speaker | `typedReplyVoice(settings)` → `voiceURI` (Mac) |
| Connect payload | `realtimeConnectFromSettings` |
| Session body | `sessionUpdateFromSettings` / `buildSessionUpdate` |
| Settings labels | `VOICE_SETTINGS_COPY` |

Local Conversation speaker is **Kokoro ids only** (`af_heart`, `af_bella`, `bm_fable`, …). `localConversationVoice()` coerces Pocket / unknown ids to `af_heart`. The sidecar has **no** `/v1/voices` (404). Do not list Pocket names in the Local picker.

`browser` (System) is a Voice provider, not a second settings section. Voice mode then uses Web Speech listen + the device TTS. Realtime backends never receive a system `voiceURI`.

Settings must `await` `settings.voice` before `restartVoiceIfNeeded()`. Fire-and-forget `void run()` then restart reads the old voice.

## Realtime session

`src/lib/realtime-session.ts` opens the WebSocket and sends `session.update` with `session.voice` and `session.audio.output.voice`. Playback: `ScheduledAudioQueue.flush()` must `stop()` every queued source. Leftover cancelled PCM must not play.

## Persist

`src/lib/persist.ts` — PGLite in IndexedDB (`idb://moya-mind`) when no `DATABASE_URL`; Neon when set. Settings are one JSON row. `normalizeSettings` heals `custom` → `s2s` and coerces Local voice to a Kokoro id. Stored `browser` stays System.

## Auth

Better Auth at `/api/auth/*` → Grok broker (Google, X). Off on `tauri://localhost` / `tauri.localhost`. `createAuthClient` needs an `http(s)` `baseURL`. Do not rewrite `src/lib/auth/server.ts`. No `src/routes/auth/popup.tsx`.

## UI kit

`src/components/ui/*` are Base UI (or native HTML). Use `render`, not `asChild`. Label is `<label>`. Sliders take a scalar. Switch rows wrap the control in `<label>`. Beige fill is `bg-primary` / `text-primary-foreground`. Gray copy is `text-muted-foreground`. Focus is `ring-inset` (inner ring) — outset rings clip under `overflow: hidden`. Do not `shadcn add --overwrite` customized files; replay Moya classes from a `--dry-run` / `--diff`, and keep `ring-inset`. Calendar is `react-day-picker`, not a Radix wrapper.

## Desktop

Identifier `africa.moya`. `frontendDist` is `../dist/client`. Close-to-tray in `src-tauri/src/lib.rs`. Packaged app has no Node server.
