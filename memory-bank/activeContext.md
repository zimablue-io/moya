# Active context

## Current focus

Connector catalog UX (not implemented). Many connections at once — not a Model Select. Live Claude directory is 2-col cards with in-card 2-line descriptions (fixed height, still too tall for Settings). Linear Integrations is a full-width list. Raycast Grid is the match: icon + one-line label, tooltip for copy. Moya: equal-cell grid, portaled Tooltip (not yet in the kit; InfoTip Popover is click-only), instance list stays below. Do not expand cards on hover.

## Current focus (voice / UI)

Voice Settings matches Model: one Provider select, then only that provider’s fields. System is the built-in-voices choice (not a Mac option). Local Base URL is a field, not a hidden Connection drawer.

## What just changed

1. Product classes moved off colliding Moya names: `bg-accent` / `text-accent-fg` → `bg-primary` / `text-primary-foreground`; `text-muted` → `text-muted-foreground`.
2. Brand palette SSOT: beige is `--color-brand` / `COLOR.brand`; gray text is `--color-quiet` / `COLOR.quiet`. `:root --primary` still points at beige.
3. Unused `cmdk` and `vaul` removed so `@radix-ui/*` is gone from the lockfile.
4. `Input` / `Textarea` dropped `forwardRef` (React 19 props refs).

## What is not done

- Spoken Local Kokoro voice still needs a sidecar restart + listen (unchanged).
- Do not `shadcn add --overwrite` customized wrappers. Do not `init -d`. Do not `migrate radix`.
- Settings forms still use the local Field helper, not shadcn `Field` / `FieldGroup`.
- Dropdowns are shadcn `Select` (`@base-ui/react/select`), not a native `<select>`. Focus is `outline-none` + `focus-visible:border-ring` + `ring-3 ring-ring/50`.

## Active decisions

- Beige CTA is `bg-primary`. `accent` is the muted hover surface so CLI-added components look right.
- Wrappers keep Moya sizes (`h-11`) and `danger` / `destructive` aliases.
- Calendar stays `react-day-picker`. Transcript calendar is behind the Calendar chip, not shown in List.

## Next

1. Public MIT (2026-08-19): LICENSE, NOTICE, CONTRIBUTING, SECURITY, CoC, FUNDING.yml. Package name is `moya`, not `app-builder-workspace`. xAI App Builder skills removed from git. Grok `extensions.js` injects only when `VITE_PROJECT_ID` is set.
2. First-run on `/`: idle copy + verbs, setup sheet on first send, web-only Download. Conversion is first successful turn, not login.
3. GitHub Releases / updater still not shipped. `DOWNLOAD_APP_URL` points at `releases/latest` (empty until a signed build is published).
4. Add new UI with `pnpm dlx shadcn@latest add <name>` (Base UI). Replay Moya classes; do not overwrite.
5. Owner restarts the sidecar to hear Local voice.
