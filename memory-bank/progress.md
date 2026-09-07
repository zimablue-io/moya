# Progress

## Works (in-repo, tested)

- Assistant home, local persist (PGLite), transcript calendar, routines, inbox, sources.
- Environment-owned turns and chrome (`settings.voice`, `settings.provider`, `ui.*`).
- Host gates: web hides Ollama / llama.cpp URL / Local Voice / on-device GGUF. Mac `.app` keeps Ollama / llama.cpp URL in Model, offers Local Voice, and in-process GGUF (`ondevice` when `hostCaps().onDeviceLlm`). `completeTurn` HTTP vs invoke covered by `scripts/host.test.mjs`.
- Shared Tauri `llm_*` commands. Engine: Mac Metal, Android Vulkan, iOS Metal; Windows/Linux stub. Paths/pick are shared modules. Desktop + engine: Open from disk. Model default is on-device GGUF; web remaps to Custom. Voice default is Custom (empty URL).
- Voice **contract**: Conversation speaker is `voiceBackend.voice`; empty Local sends `af_heart`; speakers list from the configured endpoint (`/tts/voices` on the xAI URL, `/voices` otherwise) with hardcoded fallback; Web Speech finals are not realtime Voice turns; barge-in flush/stale-audio tests in `scripts/realtime-voice.test.mjs`.
- Settings Voice: Custom (OpenAI Realtime URL) plus Local on desktop. Labels for Custom match Model (`PROVIDER_PRESETS.custom.label`). Web omits Local, Ollama, and llama.cpp. Local picker is Kokoro-only when the sidecar has no `/voices` list.
- First open is a three-step dialog (provider → voice → soul). Settings stays closed until those three are written. Mac provider step mounts the same Model tab as Settings. Greetings do not send the tool catalog. Pick does not mmap Metal; `llm_complete` loads on the first turn. Weights unload on hide-to-tray, Quit, leaving `ondevice`, and ~5 min idle.
- On-device decode sizes `LlamaBatch` to `n_ctx` (not 512). A 512-token batch cannot hold `toolsFor()` (catalog). `nativeInvokeError` keeps the real engine message. Ignored `prove_documents_e4b_completes_with_app_tools` is the Talk-shaped complete (short + tools, one load).
- On-device greetings: capability prompt allows chat without tools; a query-only hop does not loop; empty / “I have nothing to add” gets one speak-only follow-up.
- Brand SSOT: Bricolage Grotesque + Ubuntu; palette in `src/lib/brand.ts` (`COLOR.brand` beige, `COLOR.quiet` gray text).
- **UI kit:** `components.json` is `style: base-nova`, `base: base`. Wrappers use `@base-ui/react` (`render`, native `<label>`, scalar sliders). No `@radix-ui/*` in app or lockfile. Focus is `ring-inset` (inner ring). Appearance is proven by `scripts/ui-visual.test.mjs` (boot + pixel audit), not by class names.

## Left to prove by ear

- GPU / RAM drop after close-to-tray or leaving on-device, on a **rebuilt** binary. Source and `cargo check` are not that.
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
- `bundle_dmg.sh` Finder AppleScript needs Automation → Finder. If that fails, `package-mac.mjs` still writes the 660×400 large-icon drag-to-Applications window by stamping a `.DS_Store` (icon size 128) without Finder.

## Status

Repo is **public** (`zimablue-io/moya`). MIT © 2026 Lefa Moffat. Packaged Mac `.app` links llama.cpp Metal. Leftover Local Voice is remapped to System on that host so Talk does not hit `:8765`. Spoken System voice in that `.app`: **unverified** until someone listens. Version lives in the lockstep files (`0.1.6`). `pnpm package:mac` and Release build that number; they do not increment it.

## Connector presets (shipped in Settings → Sources)

- Catalog grid: Google Calendar, Apple Calendar, Outlook Calendar, Linear, GitHub, Attach files.
- Contract in `src/lib/source-contract.ts`. Tests in `scripts/source-presets.test.mjs`.
- Hover description is shadcn Tooltip (portaled). No kind Select.
- Clicking a tile starts another draft. Linear/GitHub only ask for a token.
- Booted `http://127.0.0.1:5173` Settings → Sources: 3×2 grid, Google ICS form, Linear token form.
- Gmail / official Google MCP still not in the catalog. CORS on live Google ICS is unchanged.
