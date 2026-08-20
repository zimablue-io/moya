# Moya — agent overlay

This is **Moya**, a local-first personal assistant (web + Tauri desktop; Android/iOS apps in the same repo). Product copy, routes, and data stay on-device. Do not re-scaffold it as a generic app-builder template.

## Product

- Home (`/`) is the assistant. Sign-in is optional; `/login` is not a gate.
- Memory, transcript, routines, inbox, and settings persist locally (`src/lib/persist.ts`).
- Chat completion is `completeTurn` in `src/lib/llm.ts`. Cloud and Mac sidecars use `fetch`. Provider `ondevice` uses Tauri `invoke("llm_complete")` (in-process llama.cpp + a user-picked GGUF). Same `{ ok, content, toolCalls }` either way. Desktop Mac does **not** use in-process llama.cpp — llama-server / Ollama stay HTTP.
- Voice mode is OpenAI Realtime over WebSocket (`src/lib/realtime-session.ts`). Backends: Local (`huggingface/speech-to-speech` on `:8765`), Grok, OpenAI, System. llama.cpp is Settings → Model only; it is not a voice server. Moya does not start speech-to-speech or llama-server. Web does not offer Local voice, Ollama, llama.cpp-as-localhost, or on-device GGUF (`liveSettings` / `hostCaps` / `*ChoicesForHost`). Phone/tablet apps hide those sidecars too and may offer `ondevice`. Voice on mobile is Grok or System for this work.
- Sidecar pickers must use `isDesktopOs()` / `hostCaps()`, not `isDesktop()` alone. `isDesktop()` means any Tauri webview (true on Android/iOS) and would wrongly show `127.0.0.1` servers on a phone.
- Realtime barge-in must keep sending mic audio while the agent talks, flush local playback on `speech_started`, ignore leftover audio from the cancelled reply, wait for the user to finish, then play the new reply. Muting the mic to dodge echo makes interruption impossible. Resetting the play cursor is not enough — `ScheduledAudioQueue.flush()` has to `stop()` every queued source.
- The packaged `.app` has no Node server. Do not add `createServerFn` paths that the `.app` must call.

## Commands

```sh
pnpm dev              # http://127.0.0.1:5173
pnpm desktop          # tauri dev; beforeDevCommand is `npm run dev`
pnpm package:mac      # tauri build → .app + drag-to-Applications .dmg (needs Finder)
pnpm android:init     # generate Android Studio project (needs SDK/NDK)
pnpm ios:init         # generate Xcode project
pnpm test
pnpm lint
pnpm typecheck
```

CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck, and tests on every pull request. Version lives in the lockstep files. `pnpm package:mac` and Release build that number — they do not increment it, and there is no `pnpm bump` or Actions Bump job. Landing on `main` may publish a Mac DMG in the same Release workflow — a `GITHUB_TOKEN` tag push cannot start a second job. Do not advertise that DMG as the install path. Mac app is clone + `pnpm package:mac` (`#mac-app`). `scripts/shipping-contract.test.mjs` must stay red if the workflows disappear.

Release artifacts:

- `src-tauri/target/release/bundle/macos/Moya.app`
- `src-tauri/target/release/bundle/dmg/Moya_<version>_aarch64.dmg`

## Auth

Better Auth at `/api/auth/*` federates to the Grok broker (Google, X only). Do **not** rewrite `src/lib/auth/server.ts`. Email/password is only `src/lib/auth/email-password.ts`. Never add `src/routes/auth/popup.tsx`.

| Origin                                             | `authEnabled`                       |
| -------------------------------------------------- | ----------------------------------- |
| `http(s)://` except `tauri.localhost`              | On unless `VITE_AUTH_ENABLED=false` |
| `tauri://localhost` or `http(s)://tauri.localhost` | Off — `src/lib/auth/origin.ts`      |

`createAuthClient` must receive an `http(s)` `baseURL`. A raw `tauri://` origin throws and paints “Something broke”. Keep `resolveAuthClientConfig` in front of the client.

`authMiddleware` is unused on product server functions. Do not invent per-user cloud rows unless the product asks for them.

## Desktop packaging (do not regress)

- `src-tauri/tauri.conf.json`: identifier `africa.moya` (must not end in `.app`).
- `beforeDevCommand` is `npm run dev`. Empty means `pnpm desktop` waits 180s and dies.
- `frontendDist` is `../dist/client` and must contain a bootable `index.html` after `pnpm build:desktop`.
- Desktop Vite is SPA mode (`vite.config.ts`, `prerender.outputPath: "/index"`).
- Icons listed in `bundle.icon` must exist; `.icns` files must be real icns (magic `icns`).
- Local `package:mac` does not set `CI=true` (Finder can layout the DMG). Release sets `CI=true` on the runner.
- `scripts/desktop-frontend.mjs` runs after the desktop Vite build and fails if `index.html` is missing.
- Closing the window hides to the tray (`src-tauri/src/lib.rs`) on **desktop OS only** (`#[cfg(desktop)]`). Android/iOS do not get tray or autostart.

## Data

- No `DATABASE_URL` → PGLite (preview / local).
- `DATABASE_URL` set → Neon Postgres.
- Do not create a `.env` for preview auth. Do not expose non-`VITE_` secrets to the client.

## Quality

- Format: `pnpm format` (Biome). Lint: `pnpm lint` (Biome). Tests: `pnpm test`.
- After code changes: format, lint, then tests before claiming done.
- Desktop/runtime claims require booting `Moya.app` or `pnpm desktop`, not path-exists.
- On-device GGUF claims require a real Android or iOS/iPad device running a typed turn. Init success and `pnpm test` are not that.
- One path per behavior. No dual auth, no “old origin still works” aliases.
- Voice protocol JSON tests are not enough to claim barge-in works. `scripts/realtime-voice.test.mjs` must cover flush-stops-queued-sources and dropping stale output audio (`src/lib/realtime-playback.ts`).
- Voice is the product. `scripts/voice-system.test.mjs` must stay red if Conversation speaker and the system `voiceURI` get mixed, empty Local omits `af_heart`, Web Speech finals become realtime Voice turns, leftover cancelled audio plays, or Settings stops using `src/lib/voice-contract.ts`.

## Skills in this repo

`.agents/skills/` is Moya’s own agent guidance (shadcn, Radix → Base UI). This file wins on product, desktop, and auth. Do not add xAI App Builder skills back into git.
