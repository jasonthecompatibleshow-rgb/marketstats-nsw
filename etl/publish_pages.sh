#!/usr/bin/env bash
# Publish the built static site (web/, including generated web/data/) to the gh-pages branch.
# Usage: make publish   (run `make` first). Live at https://jasonthecompatibleshow-rgb.github.io/marketstats-nsw/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; TMP="$(mktemp -d)"
REMOTE="$(git -C "$ROOT" remote get-url origin)"; REV="$(git -C "$ROOT" rev-parse --short HEAD)"
test -f "$ROOT/web/data/postcodes.pmtiles" || { echo "web/data missing: run make first"; exit 1; }
cp -r "$ROOT/web/." "$TMP/" && touch "$TMP/.nojekyll"
cd "$TMP" && git init -q -b gh-pages && git add -A
git -c user.name="$(git -C "$ROOT" log -1 --format=%an)" -c user.email="$(git -C "$ROOT" log -1 --format=%ae)" commit -qm "Publish MarketStats from $REV"
git push -q -f "$REMOTE" gh-pages && echo "pushed gh-pages from $REV"
rm -rf "$TMP"
