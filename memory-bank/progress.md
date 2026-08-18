# Progress

## Works (in-repo, tested)

- Assistant home, local persist (PGLite), transcript calendar, routines, inbox, sources.
- Environment-owned turns and chrome (`settings.voice`, `settings.provider`, `ui.*`).
- Voice **contract**: Conversation speaker ≠ Mac speaker; empty Local sends `af_heart`; Web Speech finals are not Voice turns; barge-in flush/stale-audio tests in `scripts/realtime-voice.test.mjs`.
- Settings Voice offers Local / Grok / OpenAI only. Local picker is Kokoro-only.
- Brand SSOT: Bricolage Grotesque + Ubuntu; palette in `src/lib/brand.ts` (`COLOR.brand` beige, `COLOR.quiet` gray text).
- **UI kit:** `components.json` is `style: base-nova`, `base: base`. Wrappers use `@base-ui/react` (`render`, native `<label>`, scalar sliders). No `@radix-ui/*` in app or lockfile. `pnpm test` 167 pass. Booted `http://127.0.0.1:5173`: Settings tabs/switches/sliders/info popover; Transcript Calendar 42 cells; dialogs close.

## Left to prove by ear

- Selected Local Kokoro voice is **heard** after sidecar restart. Not proven this session.
- Barge-in in a live Voice session (tests cover flush; live interrupt is separate).

## Known issues

- Hugging Face speech-to-speech has no `/v1/voices`. Live catalog fetch always 404s.
- Upstream `kokoro_handler.py` overwrites session voice when STT language is `en` (maps to British `bm_fable`). Patched on this machine; **restart required**.
- Settings Model can auto-select the first listed model if the stored id is missing from `/models`.
- Canvas overlay intercepts pointer events; Playwright menu clicks need `{ force: true }`. First Escape closes a popover before its parent dialog.

## Status

Radix → Base UI + shadcn token pass: **done**. Spoken Local voice: **unverified** until sidecar restart + listen.
