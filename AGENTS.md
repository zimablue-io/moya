# Moya — agent overlay

This is **Moya**, a local-first personal assistant (web + Tauri desktop). Product copy, routes, and data stay on-device. Do not re-scaffold it as a generic app-builder template.

## Product

- Home (`/`) is the assistant. Sign-in is optional; `/login` is not a gate.
- Memory, transcript, routines, inbox, and settings persist locally (`src/lib/persist.ts`).
- Chat completion is a client `fetch` to the configured provider (`src/lib/llm.ts`). Desktop uses the same function.
- The packaged `.app` has no Node server. Do not add `createServerFn` paths that the `.app` must call.

## Commands

```sh
pnpm dev              # http://127.0.0.1:5173
pnpm desktop          # tauri dev; beforeDevCommand is `npm run dev`
pnpm package:mac      # CI=true tauri build → .app + .dmg
pnpm test
pnpm lint
pnpm typecheck
```

Release artifacts:

- `src-tauri/target/release/bundle/macos/Moya.app`
- `src-tauri/target/release/bundle/dmg/Moya_0.1.0_aarch64.dmg`

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
- `package:mac` sets `CI=true` so DMG creation does not need Finder automation.
- `scripts/desktop-frontend.mjs` runs after the desktop Vite build and fails if `index.html` is missing.
- Closing the window hides to the tray (`src-tauri/src/lib.rs`).

## Data

- No `DATABASE_URL` → PGLite (preview / local).
- `DATABASE_URL` set → Neon Postgres.
- Do not create a `.env` for preview auth. Do not expose non-`VITE_` secrets to the client.

## Quality

- Format: `pnpm format` (Prettier). Lint: `pnpm lint` (ESLint; `src-tauri/target` is ignored). Tests: `pnpm test`.
- After code changes: format, lint, then tests before claiming done.
- Desktop/runtime claims require booting `Moya.app` or `pnpm desktop`, not path-exists.
- One path per behavior. No dual auth, no “old origin still works” aliases.

## Skills in this repo

`.grok/skills/` is platform guidance (auth, og, xai-api, design-ui). This file wins when it conflicts — especially packaged-desktop auth.
