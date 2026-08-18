# Active context

## Current focus

Local Voice listed speakers the sidecar cannot speak, and Settings restarted Voice before the store write landed. Display type was still an editorial serif (Source Serif 4).

## What just changed

1. Local catalog is Kokoro-only. Pocket names are not offered. Unknown Local ids coerce to `af_heart`.
2. `applyVoiceBackend` / `setVoiceBackendField` return the persist promise. Settings awaits that write before `restartVoiceIfNeeded()`.
3. Display is **Bricolage Grotesque**, UI is **Ubuntu**. Self-hosted. `--font-display` falls back to sans-serif, not Times.

## What is not done

- Spoken Local Kokoro voice still needs a sidecar restart + listen. The handler on this machine was patched so session voice is not overwritten by STT `en` → `bm_fable`. A running process does not pick that up.
- Do not claim Voice works from `session.update` payload or unit tests.

## Active decisions

- Conversation speaker ≠ Mac `voiceURI`.
- Two sans faces only. No typical AI serif.

## Next

1. Owner restarts speech-to-speech and listens (Heart vs Fable).
2. Keep `scripts/voice-system.test.mjs` and `scripts/brand-ssot.test.mjs` red if Pocket returns to Local or a serif returns to display.
