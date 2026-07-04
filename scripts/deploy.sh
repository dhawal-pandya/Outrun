#!/usr/bin/env bash
# Build the static site and publish dist/ to the gh-pages branch of `origin`.
# Dependency-free: a throwaway git repo inside the (gitignored) build output is
# force-pushed, so gh-pages holds only the artifact, never source history.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

REMOTE=$(git remote get-url origin)
echo "→ building…"
npm run build

echo "→ publishing dist/ to gh-pages on ${REMOTE}…"
cd dist
touch .nojekyll            # let GitHub Pages serve files/dirs starting with _
git init -q
git checkout -q -b gh-pages
git add -A
git commit -qm "deploy $(date -u +%FT%TZ)"
git push -f "$REMOTE" gh-pages
rm -rf .git                # leave dist/ a plain build folder again
echo "✓ deployed."
