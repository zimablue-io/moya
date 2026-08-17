# Moya

One local-first personal assistant. Memory, routines, and models stay on this machine.

## What it does

- Voice- and text-first chat with a presence UI
- On-device memory, transcript (list + calendar), routines, and inbox
- OpenAI-compatible providers (xAI, OpenAI, Groq, OpenRouter, Ollama, llama.cpp). You run local servers; Moya connects to them.
- Optional Google / X sign-in on the **web** preview and `pnpm desktop` (Vite on port 5173)

The home screen is not gated. Sign-in is optional. Chat, memory, and settings persist locally (embedded PGLite / IndexedDB).

## Requirements

- Node 22+
- pnpm
- For desktop: [Rust](https://rustup.rs/) and the Tauri 2 system deps for your OS

## Commands

```sh
pnpm install

pnpm dev              # web app at http://127.0.0.1:5173
pnpm desktop          # Tauri window + Vite (starts the frontend itself)
pnpm package:mac      # release .app and .dmg

pnpm test
pnpm lint
pnpm typecheck
pnpm format
```

### Desktop artifacts

`pnpm package:mac` writes:

- `src-tauri/target/release/bundle/macos/Moya.app`
- `src-tauri/target/release/bundle/dmg/Moya_0.1.0_aarch64.dmg`

Closing the window hides Moya to the menu-bar tray. Quit from the tray menu or Cmd+Q.

### Packaged app vs `pnpm desktop`

| How you run it               | Origin                  | Sign-in                                                            |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------ |
| `pnpm desktop` or `pnpm dev` | `http://127.0.0.1:5173` | On — `/login` → this app’s `/api/auth` → Grok broker → Google or X |
| `Moya.app` / the DMG         | `tauri://localhost`     | Off — no Node auth server in the bundle                            |

Chat in the packaged app talks to the provider from the window (`fetch`). Add a key in Settings, or choose llama.cpp (local) as the provider.

## Auth (web)

Better Auth is mounted at `/api/auth/*` (`src/routes/api/auth/$.ts`). It federates to the Grok broker (`auth.grok.me`) for Google and X. Email/password is off (`src/lib/auth/email-password.ts`).

Do not add `src/routes/auth/popup.tsx`. The live-preview popup is served by the Vite plugin.

## Stack

React 19, TanStack Start, Tailwind v4, Better Auth, PGLite (or Neon when `DATABASE_URL` is set), Tauri 2.

## Tests

`pnpm test` runs `scripts/**/*.test.mjs` (brand assets, PWA injector, desktop bundle contracts, packaged-origin auth, transcript day/stats).
