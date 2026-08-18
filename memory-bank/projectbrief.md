# Project brief — Moya

Moya is a **local-first personal assistant** (web + Tauri desktop). Product copy, routes, and data stay on-device. Do not re-scaffold it as a generic app-builder template.

**Tagline:** One assistant. Local first. Voice first.

## Scope

- Home (`/`) is the assistant. Sign-in is optional; `/login` is not a gate.
- Voice- and text-first chat with a presence UI.
- On-device memory, transcript (list + calendar), routines, inbox, sources, and settings.
- Chat completion is a client `fetch` to the configured provider. Desktop uses the same function.
- Voice mode is OpenAI Realtime over WebSocket. Local voice is `huggingface/speech-to-speech` on `:8765`. llama.cpp is Settings → Model only; it is not a voice server.
- Moya does **not** start speech-to-speech or llama-server.
- The packaged `.app` has no Node server. Do not add `createServerFn` paths the `.app` must call.

## Out of scope

- Cloud-owned user rows unless the product explicitly asks.
- Dual auth paths or “old origin still works” aliases.
- Treating llama.cpp as a realtime voice backend.
- Claiming Voice works from protocol JSON tests alone.

## Quality bar

Voice is the product. A green `scripts/voice-system.test.mjs` proves Moya’s contract, not that the sidecar spoke the selected voice. Hear it, or say you have not.
