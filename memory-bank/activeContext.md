# Active context

## Current focus

`pnpm package:mac` is `tauri build` only. It does not rewrite versions. Failed DMG runs leave `rw.*.dmg` next to `Moya.app` and can leave `/Volumes/Moya` mounted; the next `-srcfolder` packs those leftovers in and `bundle_dmg.sh` dies. `desktop-frontend.mjs` (already the beforeBuild hook) deletes those temps and ejects leftover Moya volumes.

On-device GGUF on phone/tablet native apps: in-process llama.cpp via Tauri `invoke`, same JS tool loop. Web stays cloud-only. Mac keeps localhost sidecars.

## Host gates

- `isTauri()` — native webview (Mac, Android, iOS)
- `isDesktop()` — alias of `isTauri()` for mic / notifications / “download Mac app”
- `isDesktopOs()` — macOS / Windows / Linux only → Ollama, llama.cpp URL, Local Voice
- `hasOnDeviceLlm()` — phone/tablet Tauri (or `llm_status.available`) → `ondevice`
- Web: not Tauri → hide sidecars, no `ondevice`

`liveSettings()` uses `hostCaps()`. A phone app must not show `127.0.0.1` Ollama.

## What just changed

1. Provider id `ondevice`: no `baseUrl`. `completeTurn` dispatches to `invoke("llm_complete")`. HTTP path extracted to `src/lib/llm-http.ts`.
2. Shared Tauri commands in `src-tauri/src/llm.rs`. Desktop stub `available: false`. Android links llama.cpp + Vulkan; iOS/iPad Metal. Same APK/IPA on tablets.
3. Settings/Setup GGUF picker downloads into app files. Suggested defaults: Qwen 3 1.7B Q4 and Gemma 4 E2B Q4.
4. `tauri android init` / `tauri ios init` generated `src-tauri/gen/android` and `src-tauri/gen/apple` (gitignored). Tray/autostart are `#[cfg(desktop)]`.
5. Voice on mobile: Grok or System. No speech-to-speech sidecar.

## What is not proven

- Typed `memory.write` on a real Android phone/tablet or iPhone/iPad. No device was attached (`adb devices` empty). Do not claim inference works from path-exists or init success.
- Mac in-process llama.cpp (out of scope; sidecar stays).
- On-device Voice (Parakeet/Kokoro).

## Next

1. Boot the Android APK and iOS app on hardware; pick a small GGUF; prove a typed turn.
2. If Android Vulkan cmake fails on NDK, fall back to CPU (`android-static-stdcxx` without `vulkan`).
3. Homebrew rust has no `rustup`; mobile Rust targets were skipped at init (`--skip-targets-install`).
