# Reza Desk tests

Automated checks that run the real app (`index.html`) in a phone-sized headless Chromium.
They are developer tools only: the app never loads anything from this folder.

## Run

```sh
sh tests/run.sh          # everything (about 2½ minutes)
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
| `75-privacy.test.js` | calendar feed carries no clinic-client names, phones, notes or case codes · AI de-identification removes names, phones, e-mail, links and addresses · deleting a record drops its unsaved drafts and keeps it in the trash |
| `80-sw-shell.test.js` | O2: the service worker may only store and serve the real app as the offline shell (navigation refresh, `stashLatest()`, ordinary fetch of `index.html`, new-worker install, upgrade from caches poisoned earlier) · O3: a new version whose shell is not the app or whose files fail to download (404, dropped) never activates and the last working cache stays complete; the real `index.html` is accepted byte-for-byte; 404/500/dropped responses never replace the shell. |
| `81-sw-shell-static.test.js` | O2: `isShellUrl()` matches only the app's own `/` and `index.html` (any query), `isApp()` accepts the real page and rejects pages without the version declaration — including the validation code itself. |
| `90-menu.test.js` | every menu entry opens without a page error (empty device and after a business cycle) · the Help page lists every entry with a description |
| `lib.js` | local static server, browser launch, condition-based waits, synthetic seeds, invariants |

## Rules

- **Synthetic data only.** Never put real names, phone numbers, amounts, keys or tokens in tests.
- **No network.** Every host other than the local test server is blocked or replaced by a fake inside the test browser.
- **No fixed sleeps.** Wait for a condition (a selector, the data version, a toast).
- Every confirmed bug fix adds a test that fails on the version before the fix.
- A hanging test fails with «timed out»; a test file that ends without printing its summary, or with an unhandled rejection, fails.
- Every browser is closed when a file ends. Each temporary browser profile the tests create (`miz-test-*`, `miz-off-*` in the system temp folder) is deleted after its browser has closed; anything else is never touched, and a profile that cannot be safely removed is reported, not deleted.

## Updating the golden fingerprint (`20-accounting`)

Only when an accounting change is intended:

1. Make the app change on a branch; run `node tests/20-accounting.test.js`. It fails with «fingerprint changed» and shows *now* and *golden*.
2. Explain every difference (which accounts moved and why) in the review.
3. `MIZ_GOLDEN_PRINT=1 node tests/20-accounting.test.js` prints the candidate fingerprint. **This run always fails on purpose**; print mode can never make the suite pass.
4. Paste the candidate into `GOLDEN` in `20-accounting.test.js`, in the **same commit** as the app change, and say so in the commit message.
5. Run the full suite without the variable: it must pass.
