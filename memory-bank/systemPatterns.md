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

Settings must `await` `settings.voice` before `restartVoiceIfNeeded()`. Fire-and-forget `void run()` then restart reads the old voice.

## Realtime session

`src/lib/realtime-session.ts` opens the WebSocket and sends `session.update` with `session.voice` and `session.audio.output.voice`. Playback: `ScheduledAudioQueue.flush()` must `stop()` every queued source. Leftover cancelled PCM must not play.

## Persist

`src/lib/persist.ts` — PGLite in IndexedDB (`idb://moya-mind`) when no `DATABASE_URL`; Neon when set. Settings are one JSON row. `normalizeSettings` heals legacy backends (`browser` / `custom` → `s2s`) and coerces Local voice to a Kokoro id.

## Auth

Better Auth at `/api/auth/*` → Grok broker (Google, X). Off on `tauri://localhost` / `tauri.localhost`. `createAuthClient` needs an `http(s)` `baseURL`. Do not rewrite `src/lib/auth/server.ts`. No `src/routes/auth/popup.tsx`.

## UI kit

`src/components/ui/*` are the existing shadcn wrappers. Beige is `COLOR.accent` / `--color-accent`. Gray copy is `text-muted`. Calendar is `react-day-picker`. Do not invent a second design system beside `src/lib/brand.ts`.

## Desktop

Identifier `africa.moya`. `frontendDist` is `../dist/client`. Close-to-tray in `src-tauri/src/lib.rs`. Packaged app has no Node server.
