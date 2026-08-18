# Progress

## Works (in-repo, tested)

- Assistant home, local persist (PGLite), transcript calendar, routines, inbox, sources.
- Environment-owned turns and chrome (`settings.voice`, `settings.provider`, `ui.*`).
- Voice **contract**: Conversation speaker ≠ Mac speaker; empty Local sends `af_heart`; Web Speech finals are not Voice turns; barge-in flush/stale-audio tests in `scripts/realtime-voice.test.mjs`.
- Settings Voice offers Local / Grok / OpenAI only. Local picker is Kokoro-only.
- Brand SSOT: Bricolage Grotesque + Ubuntu. Palette keys in `src/lib/brand.ts` (`COLOR.accent` beige, `COLOR.muted` gray text).

## Left to prove by ear

- Selected Local Kokoro voice is **heard** after sidecar restart. Not proven this session.
- Barge-in in a live Voice session (tests cover flush; live interrupt is separate).

## Known issues

- Hugging Face speech-to-speech has no `/v1/voices`. Live catalog fetch always 404s.
- Upstream `kokoro_handler.py` overwrites session voice when STT language is `en` (maps to British `bm_fable`). Patched on this machine; **restart required**.
- Settings Model can auto-select the first listed model if the stored id is missing from `/models`.

## Status

Local catalog + persist-before-restart + sans type swap: in repo. Spoken Local voice: **unverified** until sidecar restart + listen.
