# Tech context

## Stack

- React 19, TanStack Start / Router, Tailwind v4, Biome
- UI: existing shadcn wrappers in `src/components/ui`. Beige is `--color-accent` / `COLOR.accent`. Gray text is `--color-muted` / `COLOR.muted`.
- Zustand store + Environment act/query
- PGLite (`@electric-sql/pglite`) or Neon when `DATABASE_URL` is set
- Better Auth (web / `pnpm desktop` only)
- Tauri 2 desktop (`src-tauri/`, identifier `africa.moya`)
- TypeScript. Tests: `node --experimental-strip-types --test 'scripts/**/*.test.mjs'`

## Commands

```sh
pnpm dev              # http://127.0.0.1:5173
pnpm desktop          # tauri dev; beforeDevCommand is `npm run dev`
pnpm package:mac      # CI=true tauri build
pnpm test
pnpm lint
pnpm typecheck
pnpm format
```

## Voice backends

| Id | Label | Endpoint | Speakers |
| --- | --- | --- | --- |
| `s2s` | Local | `http://127.0.0.1:8765/v1` | Kokoro ids only |
| `xai` | Grok | `https://api.x.ai/v1` | Live `/v1/tts/voices` or preset |
| `openai` | OpenAI | `https://api.openai.com/v1` | Realtime voices |

Local sidecar (human-started, example observed 2026-08-17):

```sh
speech-to-speech --mode realtime --stt parakeet-tdt \
  --llm_backend chat-completions --tts kokoro \
  --kokoro_voice af_bella --kokoro_lang_code a \
  --model_name gemma4:e4b \
  --responses_api_base_url http://127.0.0.1:8080/v1 \
  --responses_api_stream --enable_live_transcription
```

Installed handler (this machine):  
`/Users/lefamoffat/Documents/models/llms/lib/python3.12/site-packages/speech_to_speech/TTS/kokoro_handler.py`

Upstream Kokoro maps STT `"en"` → British and overwrites the session voice with `bm_fable`. That file was patched so session voice wins and lang follows the voice prefix. **A running process does not pick up the patch until speech-to-speech is restarted.**

`GET /v1/voices` on the sidecar is 404. Do not treat a 404 as “use Pocket + Kokoro fallback.”

## Constraints

- Node 22+, pnpm, Rust for desktop.
- No `.env` for preview auth. No non-`VITE_` secrets on the client.
- Format/lint: Biome. After code changes: format, lint, tests before claiming done.
- Desktop/runtime claims require booting the artifact, not path-exists.
