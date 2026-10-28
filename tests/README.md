# Reza Desk tests

Automated checks that run the real app (`index.html`) in a phone-sized headless Chromium.
They are developer tools only: the app never loads anything from this folder.

## Run

```sh
sh tests/run.sh          # everything (about 20 s)
sh tests/run.sh 20       # only tests/20-*.test.js
node tests/30-docs.test.js
```

Requirements on the machine that runs them: Node 18 or newer and Playwright with Chromium.
Nothing is installed into the app or the repository.

`MIZ_ROOT=/path/to/copy sh tests/run.sh` runs the same tests against another copy of the app
(used to prove a test fails on the previous version or on a deliberately broken copy).

## Files

| File | What it protects |
|---|---|
| `00-static.test.js` | script parses · action names unique · version numbers agree · every pre-cached file exists |
| `10-smoke.test.js` | every tab, «مالی» sub-tab and domain page renders without errors or network |
| `20-accounting.test.js` | a full synthetic business cycle through the real forms; after **every** step: trial balance = 0, every entry balanced, person balances = receivables − payables, stock value = inventory account, no negative lot, lot quantities consistent, no two live versions of a document; final golden fingerprint |
| `30-docs.test.js` | document version restore and count-sheet restore |
| `40-backup-restore.test.js` | backup → clean device → identical data (plain and encrypted) · wrong passphrase and non-backup files rejected · restore keeps newer local edits, does not resurrect deletions, never removes local rows, takes a snapshot first · Excel export round trip |
| `60-offline.test.js` | service worker install, airplane-mode cold launch, offline create/edit, reopen, reconnect without duplicates or uploads |
| `70-backup-security.test.js` | no cloud upload without the encryption passphrase; encrypted upload decrypts to the same data |
| `lib.js` | local static server, browser launch, condition-based waits, synthetic seeds, invariants |

## Rules

- **Synthetic data only.** Never put real names, phone numbers, amounts, keys or tokens in tests.
- **No network.** Every host other than the local test server is blocked or replaced by a fake inside the test browser.
- **No fixed sleeps.** Wait for a condition (a selector, the data version, a toast).
- Every confirmed bug fix adds a test that fails on the version before the fix.
- `20-accounting` has a golden fingerprint. Change it only in the same reviewed commit as a deliberate accounting change, and say so in the commit message.
