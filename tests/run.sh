#!/bin/sh
# Usage: sh tests/run.sh [pattern]   e.g. sh tests/run.sh 30   → runs only 30-*.test.js
# Needs Node 18+ and Playwright with Chromium (dev machine only; nothing is added to the app).
cd "$(dirname "$0")/.." || exit 1
fail=0
for f in tests/${1:-}*.test.js; do echo "▶ $f"; node "$f" || fail=1; done
exit $fail
