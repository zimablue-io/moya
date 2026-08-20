# Product context

## Why it exists

Household assistant that stays on this machine. Memory, transcript, routines, and keys are local. Voice is the primary interface, not a demo bolted onto chat.

## How it should work

- Open `/` and talk or type. No account required.
- Settings → Voice is the same shape as Model: one Provider, then only that provider’s fields.
- Providers: Local (Kokoro speaker + Base URL), Grok / OpenAI (speaker + key), System (this device’s built-in voices + rate + pitch). System is not a second block next to Local. Web hides Local, Ollama, llama.cpp URL, and on-device GGUF. Phone/tablet apps hide the localhost sidecars; Voice there is Grok or System.
- A Mac `voiceURI` must never be sent on a Local / Grok / OpenAI `session.update`.
- Settings → Model chooses the text LLM (xAI, OpenAI, Groq, OpenRouter; on Mac also Ollama / llama.cpp URL; on phone/tablet native apps, optional on-device GGUF). That is not the voice server.
- Local Voice talks to `http://127.0.0.1:8765/v1` → `ws://127.0.0.1:8765/v1/realtime`. The human starts `speech-to-speech`.
- Barge-in: keep sending mic audio while the agent talks. Flush every queued playback source on `speech_started`. Do not mute the mic to dodge echo.

## UX goals

- Warm, analog, not SaaS-blue. Display is **Bricolage Grotesque**, UI is **Ubuntu**. No editorial serif. Palette in `src/lib/brand.ts`.
- Short household copy. One path per behavior.
- Settings must only offer controls that apply. A picker that lists voices the sidecar cannot speak is a product bug, not a catalog nicety.

## Trust

The owner has been told Voice “works” when it did not. Do not repeat that. State what was measured (sent id, test pass, heard audio) and stop there.
