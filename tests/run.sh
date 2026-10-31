#!/bin/sh
# The complete test suite — run before every release:   sh tests/run.sh
# Only some files:   sh tests/run.sh 4     → 4*-*.test.js        sh tests/run.sh 47 52 53   → those files (see: node tools/q.js tests <name>)
# Full error stacks: VERBOSE=1 sh tests/run.sh 52
# Needs Node 18+ and Playwright with Chromium (dev machine only; nothing is added to the app). Synthetic data, local server only.
cd "$(dirname "$0")/.." || exit 1
node -e "require('playwright')" 2>/dev/null || { echo "Playwright is not installed: npm i -g playwright && npx playwright install chromium"; exit 2; }
failed=""; n=0; t0=$(date +%s)
[ $# -eq 0 ] && set -- ""
for pat in "$@"; do for f in tests/${pat}*.test.js; do
  [ -e "$f" ] || { echo "no test file matches tests/${pat}*.test.js"; exit 2; }
  n=$((n+1)); echo "▶ $f"; node "$f" || failed="$failed $f"
done; done
echo "──────── $n file(s), $(( $(date +%s) - t0 )) s"
if [ -n "$failed" ]; then
  echo "FAILED:"; for f in $failed; do echo "  $f      rerun: node $f   (VERBOSE=1 for stacks)"; done; exit 1
fi
echo "ALL PASSED"
