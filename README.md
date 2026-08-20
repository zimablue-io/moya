# Moya

One assistant. Local first. Voice first.

Moya is a personal assistant that runs on this machine. Memory, transcript, routines, inbox, and API keys stay on-device. You bring the model — a local server or your own cloud key.

[Download the latest Mac build](https://github.com/zimablue-io/moya/releases/latest) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## What it does

- Voice- and text-first chat with a presence UI
- On-device memory, transcript (list + calendar), routines, and inbox
- OpenAI-compatible providers (xAI, OpenAI, Groq, OpenRouter, Ollama, llama.cpp). You run local servers; Moya connects to them.
- Voice backends: Local (`huggingface/speech-to-speech` on `:8765`), Grok, OpenAI, or this device’s System voices
- Optional Google / X sign-in on the **web** preview and `pnpm desktop` only

The home screen is not gated. Sign-in is optional. The packaged Mac app has no Node server and no account wall.

Moya does not start speech-to-speech or llama-server. Start those yourself if you want Local voice or a local LLM.

## Requirements

- Node 24+
- [pnpm](https://pnpm.io/)
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

Better Auth is mounted at `/api/auth/*`. It federates to the Grok broker (`auth.grok.me`) for Google and X. Email/password is off.

Do not add `src/routes/auth/popup.tsx`. The live-preview popup is served by the Vite plugin.

## Stack

React 19, TanStack Start, Tailwind v4, Better Auth, PGLite (or Neon when `DATABASE_URL` is set), Tauri 2.

## Tests

`pnpm test` runs `scripts/**/*.test.mjs` (brand assets, PWA injector, desktop bundle contracts, packaged-origin auth, transcript day/stats, realtime barge-in playback).

A green Voice test suite proves Moya’s contract, not that a sidecar spoke the selected voice.

`pnpm test` also checks the shipping contract: the Download link above is only honest if CI gates pull requests and a Release workflow publishes a `.dmg` when you tag `v*`.

## Releases

```sh
pnpm bump patch    # lockstep SemVer bump → open a PR
```

Or **Actions → Bump**. After merge, Tag creates `vX.Y.Z` and Release publishes the Mac DMG to [the latest release](https://github.com/zimablue-io/moya/releases/latest). Until Apple Developer ID secrets are set, Gatekeeper will warn; right-click the app → Open.

## License

[MIT](LICENSE) © 2026 Lefa Moffat. See [NOTICE](NOTICE) for fonts and third-party services.

Sponsors: [github.com/sponsors/lefamoffat](https://github.com/sponsors/lefamoffat)
