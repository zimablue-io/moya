# Security

Moya is local-first. Memory, transcript, and keys you paste in Settings stay on this device. We do not receive them.

## Report a vulnerability

Use a [GitHub security advisory](https://github.com/zimablue-io/moya/security/advisories/new).

Do not open a public issue for a vulnerability.

## Scope notes

- Packaged `Moya.app` has auth off and no Node server.
- Optional web Google / X sign-in uses the Grok broker (`auth.grok.me`).
- `src/lib/auth/preview.ts` holds the Grok sandbox shared preview OAuth client (`grok_preview`). It is scoped to `*.grok-sandbox.com` and is not a Moya production secret.
- Inference runs on a provider you configure (local server or your API key). Moya does not host models.
