# Testing and quality

How to run tests: [`../../tests/README.md`](../../tests/README.md) (also lists every test file). Release procedure: [`../RELEASE.md`](../RELEASE.md).

## What is verified automatically

- 55 Playwright test files (`sh tests/run.sh`, ~8–9 min; `sh tests/run.sh 2 4` for prefixes; `node tests/<file>` alone; `VERBOSE=1` for stacks).
- Areas: static wiring and version consistency (00, 01), docs consistency (05), core and engine reference outputs, accounting and money (20–29), documents, stock, purchase paths (71), invoice titles (72), atomic operations and rollback with failure injection (59–67, 73, 74, 76), backup/restore and sync (40, 41, 64), offline, service worker and real upgrades from older releases (47, 49, 60, 80, 81), privacy (75), integrity page read-only and private (68), menu and release notes (90, 91), UX (92).
- Business invariants after money/stock tests: `invariants()` in `tests/lib.js` (trial balance, person balances = 1201 − 2101, stock value = 1301, no two live document versions).
- Regression rule: every fix has a test that fails on the previous commit — run it with `MIZ_ROOT=<old tree> node tests/<file>` after `git archive <commit> | tar -x -C <dir>`.
- Static code rules (in tests): no direct IndexedDB write outside `js/store.js`; every `<select>` has a label; every action has a handler.

- **CI (from 4.47):** `.github/workflows/tests.yml` runs the full suite on every pull request and push to `main`; a red run blocks merging until explained.
- **Date independence:** `MIZ_NOW=<ISO time> node tests/<file>` runs a test as if it were that moment (see `tests/lib.js`); used before a release for date-seeded tests (Thursday, Friday, month end).
- Calculation rules without other tests are covered by test 77; the decisions page and amani return by test 78.

## What is not verified

- **No real-phone test** has been recorded for 4.40–4.45 (PH-1). Tests run in headless Chromium at phone size with synthetic data.
- Microphone, file sharing, persistent storage and the shop site are tested with scripted stand-ins; the live site's CORS is unverified.
- The live GitHub Pages site cannot be opened from the AI environment; deployment success is taken from the GitHub deployments API.
- Cloud mode (in-Claude view) is tested only for refusals, not for every feature.

## Results history (labelled by commit and date)

See [DEVELOPMENT_JOURNAL.md](DEVELOPMENT_JOURNAL.md). Latest: 2026-11-05 on `5dfabe5` — 429 passed, 3 failed:

| ID | Test | Cause | Status |
|---|---|---|---|
| F1 / TEST-57 | `57-mcal` «day/week/month …» | test data: a receivable due `today + 2` falls in the next Persian week on Thursday/Friday | confirmed (reproduced alone; line 14); not fixed |
| F2 | `57-mcal` «items open their own records …» | knock-on of F1 (timeout) | not confirmed |
| F3 | `49-upgrade-430` «4.32 → this version» | 60 s timeout under load | not confirmed; passes alone (21/21) |

## Known test issues

- TEST-57 (above): fixed in 4.46 (not released) by a fixed page clock; test 67 had the same weekday dependence and got the same fix. Other tests seeded with `today ± n` were not reviewed for this.
- T3: an intermittent failure in test 40 (snapshot timing) seen once, not reproduced in 36 runs.
- Under heavy load long tests can hit the 60 s per-test timeout; rerun the file alone before concluding.

## Quality gates for a release

1. Targeted tests for the change, including a new test that fails on the base commit.
2. Independent review of the diff for significant packages.
3. One full `sh tests/run.sh` on the final commit: 0 failed (or each failure explained with evidence).
4. `node tools/version.js check` consistent.
5. Secret/privacy scan of the diff.
6. Owner's explicit authorisation for merge and deployment; then verify the Pages deployment and, on the phone, the version line.
