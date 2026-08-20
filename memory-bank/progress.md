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
- CI `latest-release` on `main` stays red until `v0.1.0` publishes a `.dmg`. First DMGs are unsigned until Apple Developer ID secrets are set.

## Status

Repo is **public** (`zimablue-io/moya`). MIT © 2026 Lefa Moffat. First-run landing on `/` is in tree. Spoken Local voice: **unverified** until sidecar restart + listen. Release pipeline is in tree (CI + `pnpm bump` → PR → Tag `vX.Y.Z` → Mac DMG). No GitHub Release artifact until this lands on `main` and Tag creates `v0.1.0`.

## Connector presets (shipped in Settings → Sources)

- Catalog grid: Google Calendar, Apple Calendar, Outlook Calendar, Linear, GitHub, Attach files.
- Contract in `src/lib/source-contract.ts`. Tests in `scripts/source-presets.test.mjs`.
- Hover description is shadcn Tooltip (portaled). No kind Select.
- Clicking a tile starts another draft. Linear/GitHub only ask for a token.
- Booted `http://127.0.0.1:5173` Settings → Sources: 3×2 grid, Google ICS form, Linear token form.
- Gmail / official Google MCP still not in the catalog. CORS on live Google ICS is unchanged.
