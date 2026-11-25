#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand).
#
# Exit codes (Vercel contract):
#   0 -> skip this deployment
#   1 -> continue with install + build
#
# A push whose changed files are all docs / agent notes / repo metadata does not change what ships,
# so it must not deploy. Anything else, or anything this script cannot work out, builds.
set -uo pipefail

PREV="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^1}"
if ! git rev-parse --verify "$PREV^{commit}" >/dev/null 2>&1; then
  PREV="HEAD^1"
fi

if ! changed="$(git diff --name-only "$PREV" HEAD 2>/dev/null)"; then
  echo "vercel-ignore: cannot diff against $PREV -> build"
  exit 1
fi
if [[ -z "$changed" ]]; then
  echo "vercel-ignore: no changed files (redeploy?) -> build"
  exit 1
fi

while IFS= read -r file; do
  case "$file" in
    *[/]*) ;;
    *.md | LICENSE | NOTICE) continue ;;
  esac
  case "$file" in
    memory-bank/* | .agents/* | .github/*) continue ;;
  esac
  echo "vercel-ignore: $file ships -> build"
  exit 1
done <<<"$changed"

echo "vercel-ignore: only docs / agent notes / repo metadata changed -> skip"
exit 0
