# Progress

## Works (in-repo, tested)

- Assistant home, local persist (PGLite), transcript calendar, routines, inbox, sources.
- Environment-owned turns and chrome (`settings.voice`, `settings.provider`, `ui.*`).
- Host gates: web hides Ollama / llama.cpp URL / Local Voice / on-device GGUF. Mac desktop keeps sidecars. `ondevice` is mobile-native only. `completeTurn` HTTP vs invoke covered by `scripts/host.test.mjs`.
- Shared Tauri `llm_*` commands; desktop `available: false`. Android/iOS projects initialized under `src-tauri/gen/` (generated).
- Voice **contract**: Conversation speaker ≠ system `voiceURI`; empty Local sends `af_heart`; Web Speech finals are not realtime Voice turns; barge-in flush/stale-audio tests in `scripts/realtime-voice.test.mjs`.
- Settings Voice offers Local / Grok / OpenAI / System on desktop. Web omits Local, Ollama, and llama.cpp. Same layout as Model. Local picker is Kokoro-only. System fields show only when System is selected.
- Brand SSOT: Bricolage Grotesque + Ubuntu; palette in `src/lib/brand.ts` (`COLOR.brand` beige, `COLOR.quiet` gray text).
- **UI kit:** `components.json` is `style: base-nova`, `base: base`. Wrappers use `@base-ui/react` (`render`, native `<label>`, scalar sliders). No `@radix-ui/*` in app or lockfile. Focus is `ring-inset` (inner ring). Appearance is proven by `scripts/ui-visual.test.mjs` (boot + pixel audit), not by class names.

## Left to prove by ear

- Selected Local Kokoro voice is **heard** after sidecar restart. Not proven this session.
- Barge-in in a live Voice session (tests cover flush; live interrupt is separate).

## Known issues

- On-device llama.cpp is **not** proven on a handset. `adb devices` was empty after Android/iOS init. Do not claim phone/tablet inference.
- Homebrew `rustc` has no `rustup`; `tauri android/ios init` used `--skip-targets-install`.
- Hugging Face speech-to-speech has no `/v1/voices`. Live catalog fetch always 404s.
- Upstream `kokoro_handler.py` overwrites session voice when STT language is `en` (maps to British `bm_fable`). Patched on this machine; **restart required**.
- Settings Model can auto-select the first listed model if the stored id is missing from `/models`.
- Canvas overlay intercepts pointer events; Playwright menu clicks need `{ force: true }`. First Escape closes a popover before its parent dialog.
- CI `latest-release` on `main` stays red until `v0.1.0` publishes a `.dmg`. First DMGs are unsigned until Apple Developer ID secrets are set.
- Prebuilt GitHub DMG is optional and Gatekeeper-blocked until notarized. Install path is clone + `pnpm package:mac` on this Mac. Local build 2026-08-20: sealed ad-hoc, `codesign --verify` valid. Menu/README point at `#mac-app`, not the DMG.
- DMG background is one full-bleed light fill (no inset card). An earlier 36px “card” sat on Finder’s own window fill and looked like two backgrounds.

## Status

Repo is **public** (`zimablue-io/moya`). MIT © 2026 Lefa Moffat. First-run landing on `/` is in tree. Spoken Local voice: **unverified** until sidecar restart + listen. Version is git (last `v*` tag + commits). `pnpm package:mac` and Release apply it; there is no bump workflow.

## Connector presets (shipped in Settings → Sources)

- Catalog grid: Google Calendar, Apple Calendar, Outlook Calendar, Linear, GitHub, Attach files.
- Contract in `src/lib/source-contract.ts`. Tests in `scripts/source-presets.test.mjs`.
- Hover description is shadcn Tooltip (portaled). No kind Select.
- Clicking a tile starts another draft. Linear/GitHub only ask for a token.
- Booted `http://127.0.0.1:5173` Settings → Sources: 3×2 grid, Google ICS form, Linear token form.
- Gmail / official Google MCP still not in the catalog. CORS on live Google ICS is unchanged.
