# Contributing

Thanks for helping with Moya. This is a local-first household assistant, not a generic app-builder template.

## Before a pull request

```sh
pnpm install
pnpm check          # Biome format + lint
pnpm typecheck
pnpm test
```

Do not claim Voice, Settings, or fonts work from tests alone. State what you measured.

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
