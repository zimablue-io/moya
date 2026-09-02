# Project brief — Moya

Moya is a **local-first personal assistant** (web + Tauri desktop; Android/iOS in the same repo). Product copy, routes, and data stay on-device. Do not re-scaffold it as a generic app-builder template.

**Tagline:** One assistant. Local first. Voice first.

## Scope

- Home (`/`) is the assistant. Sign-in is optional; `/login` is not a gate.
- Voice- and text-first chat with a presence UI.
- On-device memory, transcript (list + calendar), routines, inbox, sources, and settings.
- Chat completion is `completeTurn` (`src/lib/llm.ts`): `fetch` for cloud and optional desktop sidecars; `invoke("llm_complete")` for provider `ondevice` (Mac Metal, Android Vulkan, iOS Metal) with a user-picked GGUF. Windows/Linux in-process llama.cpp is not linked yet.
- Voice mode is OpenAI Realtime over WebSocket. Local voice is `huggingface/speech-to-speech` on `:8765` (optional on desktop without an in-process engine). Mac / iOS / Android with llama.cpp hide Local and use System unless the owner picks Grok or OpenAI. llama.cpp is Settings → Model; it is not a voice server.
- Moya does **not** start speech-to-speech or llama-server.
- The packaged `.app` has no Node server. Do not add `createServerFn` paths the `.app` must call.

## Out of scope

- Cloud-owned user rows unless the product explicitly asks.
- Dual auth paths or “old origin still works” aliases.
- Treating llama.cpp as a realtime voice backend.
- Claiming Voice works from protocol JSON tests alone.

## Quality bar

Voice is the product. A green `scripts/voice-system.test.mjs` proves Moya’s contract, not that the sidecar spoke the selected voice. Hear it, or say you have not.
