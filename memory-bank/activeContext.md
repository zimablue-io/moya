# Active context

## Current focus

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

1. Add new UI with `pnpm dlx shadcn@latest add <name>` (Base UI). Replay Moya classes; do not overwrite.
2. Owner restarts the sidecar to hear Local voice.
