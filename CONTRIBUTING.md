# Contributing

Thanks for helping with Moya. This is a local-first household assistant, not a generic app-builder template.

## Before a pull request

Open a PR against `main`. Direct pushes are blocked; CI must be green.

```sh
pnpm install
pnpm check          # Biome format + lint
pnpm typecheck
pnpm test
```

`pnpm test` includes the shipping contract: if Download or README point at GitHub Releases, `.github/workflows/release.yml` must publish a `.dmg` on `v*` tags, and `.github/workflows/ci.yml` must run lint, typecheck, and tests on every pull request.

Do not advertise a user path (Download, a README link, a public URL) without the workflow that ships it. A URL-shaped test is not enough.

Do not claim Voice, Settings, or fonts work from tests alone. State what you measured.

## Cut a Mac release

Versions stay in lockstep (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src/lib/brand.ts`). Increment with SemVer:

```sh
pnpm bump patch    # 0.1.0 → 0.1.1
pnpm bump minor    # 0.1.0 → 0.2.0
pnpm bump major    # 0.1.0 → 1.0.0
pnpm bump 0.2.0    # explicit
```

Open a PR with those files (or run **Actions → Bump**). After it lands on `main`, Release builds the DMG in the same run (a `GITHUB_TOKEN` tag push cannot start a second workflow). Do not hand-edit one version file.

The menu Mac app control links to README `#mac-app` (clone + `pnpm package:mac`). Do not send people to a GitHub DMG as the install path — Apple blocks unsigned internet downloads. A Releases DMG is optional. Local builds open without that sheet because they were not downloaded from the internet.

## Product rules that regress easily

- Home (`/`) is the assistant. `/login` is not a gate.
- Store writes go through `act()` (`settings.voice`, `settings.provider`, `settings.patch`, `ui.*`).
- Local Conversation speakers are Kokoro ids (`af_heart`, `af_bella`, `bm_fable`, …). Not Pocket names, not a Mac `voiceURI`.
- The packaged `.app` has no Node server. Do not add `createServerFn` paths the `.app` must call.
- `createAuthClient` needs an `http(s)` `baseURL`. Never raw `tauri://`.
- Display type is Bricolage Grotesque; UI type is Ubuntu. No serif fallback on `--font-display`.

Agent contributors: `AGENTS.md` is the overlay. It wins over leftover platform notes.

## Issues and pull requests

- One change per PR when you can.
- Include the test you added or say why none applies.
- Desktop/runtime claims need a boot of `Moya.app` or `pnpm desktop`, not “the path exists.”

## License

By contributing you agree your work is MIT, same as [LICENSE](LICENSE), and you have the right to offer it.
