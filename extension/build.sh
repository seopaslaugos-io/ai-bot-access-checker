#!/usr/bin/env bash
# Zips the extension for the Chrome Web Store and Microsoft Edge Add-ons (same package for both).
# Output: extension/dist/ai-bot-access-checker-<version>.zip
# Excludes store assets, tests, docs and build output.
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(node -p "require('./manifest.json').version")
OUT="dist/ai-bot-access-checker-${VERSION}.zip"

node --test test/manifest.test.mjs >/dev/null || { echo "manifest checks failed: run node --test extension/test/manifest.test.mjs" >&2; exit 1; }

mkdir -p dist
rm -f "$OUT"
zip -q -r -X "$OUT" manifest.json popup.html popup.css popup.js render.js icons \
  -x '*.md' -x '.DS_Store' -x '*/.DS_Store'

echo "Built $OUT"
unzip -l "$OUT"
