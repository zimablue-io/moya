# Active context

## Current focus

Talk on a Mac `.app` was still speech-to-speech. The engine work did not change that path. Leftover IndexedDB `s2s` plus Talk skipping setup made the window feel unchanged.

## Host gates

- `isTauri()` — native webview (Mac, Android, iOS)
- `isDesktop()` — alias of `isTauri()` for mic / notifications / “download Mac app”
- `isDesktopOs()` — macOS / Windows / Linux only → Ollama, llama.cpp URL. Local Voice only when there is **no** in-process engine.
- `hasOnDeviceLlm()` — Tauri on Mac / iOS / Android (or `llm_status.available`) → `ondevice`; leftover Local remaps to System
- `pickGgufFromDisk` — on-device engine **and** desktop OS (real filesystem path). Phone/tablet download instead.
- Web: not Tauri → hide sidecars, no `ondevice`

## What just changed

1. `voiceBackendForHost` / `voiceChoicesForHost` — on `onDeviceLlm` hosts, leftover Local becomes System and Local is omitted from Settings. Desktop-without-engine (`voiceChoicesForHost(true)`) still lists Local.
2. Hydrate persists that remap **before** `ready`, and if leftover Local sat on Ollama/llama.cpp URL, Model becomes on-device once so Talk/type open “Pick a GGUF.”
3. `enterVoice` opens Setup when the model still needs a GGUF or a cloud key — not only when Grok/OpenAI Voice is missing a key.

## What is not proven

- This JS is not in the `.app` the owner already opened until they quit and run a new bundle (`pnpm desktop` or `pnpm package:mac`).
- System Talk heard.
- Typed turn on a real Android/iOS device.
- Windows/Linux in-process llama.cpp (not linked).

## Next

Quit the old `Moya.app`. Open a build that includes this frontend. Talk should open Setup (pick a GGUF) or System voice — not `:8765`. Hear it, or say you have not.
