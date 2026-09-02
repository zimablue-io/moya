# Progress

## Works (in-repo, tested)

- Assistant home, local persist (PGLite), transcript calendar, routines, inbox, sources.
- Environment-owned turns and chrome (`settings.voice`, `settings.provider`, `ui.*`).
- Host gates: web hides Ollama / llama.cpp URL / Local Voice / on-device GGUF. Mac `.app` keeps Ollama / llama.cpp URL in Model, hides Local Voice, remaps leftover `s2s` to System, and in-process GGUF (`ondevice` when `hostCaps().onDeviceLlm`). `completeTurn` HTTP vs invoke covered by `scripts/host.test.mjs`.
- Shared Tauri `llm_*` commands. Engine: Mac Metal, Android Vulkan, iOS Metal; Windows/Linux stub. Paths/pick are shared modules. Desktop + engine: Open from disk. Voice default is System.
- Voice **contract**: Conversation speaker ≠ system `voiceURI`; empty Local sends `af_heart`; first-open default is System; Web Speech finals are not realtime Voice turns; barge-in flush/stale-audio tests in `scripts/realtime-voice.test.mjs`.
- Settings Voice: System first on `onDeviceLlm` hosts (no Local). Desktop without an engine still offers Local / Grok / OpenAI / System. Web omits Local, Ollama, and llama.cpp. Same layout as Model. Local picker is Kokoro-only. System fields show only when System is selected.
- Brand SSOT: Bricolage Grotesque + Ubuntu; palette in `src/lib/brand.ts` (`COLOR.brand` beige, `COLOR.quiet` gray text).
- **UI kit:** `components.json` is `style: base-nova`, `base: base`. Wrappers use `@base-ui/react` (`render`, native `<label>`, scalar sliders). No `@radix-ui/*` in app or lockfile. Focus is `ring-inset` (inner ring). Appearance is proven by `scripts/ui-visual.test.mjs` (boot + pixel audit), not by class names.

## Left to prove by ear

- System Talk in `Moya.app` after picking a GGUF. Engine load of E4B is proven (`content="ready"`, Metal, 43/43 layers). The voice was not heard this session.
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
- Prebuilt GitHub DMG is optional and Gatekeeper-blocked until notarized. Install path is clone + `pnpm package:mac` on this Mac. Menu/README point at `#mac-app`, not the DMG.
- DMG background is one full-bleed light fill (no inset card). An earlier 36px “card” sat on Finder’s own window fill and looked like two backgrounds.
- `bundle_dmg.sh` Finder layout needs Automation → Finder for the app that launched the build. Owner terminal: -1743. Cursor agent: allowed. `package-mac.mjs` falls back to `--skip-jenkins` after a layout failure so `pnpm package:mac` still writes a DMG.

## Status

Repo is **public** (`zimablue-io/moya`). MIT © 2026 Lefa Moffat. Packaged Mac `.app` links llama.cpp Metal. Leftover Local Voice is remapped to System on that host so Talk does not hit `:8765`. Spoken System voice in that `.app`: **unverified** until someone listens. Version lives in the lockstep files (`0.1.6`). `pnpm package:mac` and Release build that number; they do not increment it.

## Connector presets (shipped in Settings → Sources)

- Catalog grid: Google Calendar, Apple Calendar, Outlook Calendar, Linear, GitHub, Attach files.
- Contract in `src/lib/source-contract.ts`. Tests in `scripts/source-presets.test.mjs`.
- Hover description is shadcn Tooltip (portaled). No kind Select.
- Clicking a tile starts another draft. Linear/GitHub only ask for a token.
- Booted `http://127.0.0.1:5173` Settings → Sources: 3×2 grid, Google ICS form, Linear token form.
- Gmail / official Google MCP still not in the catalog. CORS on live Google ICS is unchanged.
