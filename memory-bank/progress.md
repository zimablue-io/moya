# Progress

## Works (in-repo, tested)

- Assistant home, local persist (PGLite), transcript calendar, routines, inbox, sources.
- Environment-owned turns and chrome (`settings.voice`, `settings.provider`, `ui.*`).
- Voice **contract**: Conversation speaker ≠ system `voiceURI`; empty Local sends `af_heart`; Web Speech finals are not realtime Voice turns; barge-in flush/stale-audio tests in `scripts/realtime-voice.test.mjs`.
- Settings Voice offers Local / Grok / OpenAI / System. Same layout as Model. Local picker is Kokoro-only. System fields show only when System is selected.
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

Repo is **public** (`zimablue-io/moya`). MIT © 2026 Lefa Moffat. First-run landing on `/` is in tree. Spoken Local voice: **unverified** until sidecar restart + listen. No GitHub Release artifact yet.

## Connector presets (investigated, not shipped)

- Sources already sync calendar ICS and Linear/GitHub read into the Environment.
- Tools MCP is URL + Authorization header only. No OAuth.
- Official Google MCP (`gmailmcp.googleapis.com`, `calendarmcp.googleapis.com`) needs a GCP OAuth client. Packaged `.app` has no Node server.
- Browser `fetch` for Google ICS / Google MCP will likely hit CORS; attach-file ICS already works.
- Recommended ship-first tiles: Google Calendar, Apple Calendar, Outlook Calendar, Linear, GitHub. Hold Gmail until OAuth + mail-scope decision.
