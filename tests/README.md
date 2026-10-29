# Reza Desk tests

Automated checks that run the real app (`index.html`) in a phone-sized headless Chromium.
They are developer tools only: the app never loads anything from this folder.

## Run

```sh
sh tests/run.sh          # everything (about 4 minutes)
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
| `01-wiring.test.js` | no browser, ~1 s: every `data-act` has a handler, every `data-form` a submit branch, every «تازه‌ها»/menu/catalogue destination exists, every catalogue entry has help text, every draft-enabled form function exists |
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
| `91-whatsnew.test.js` | «تازه‌ها»: every «امتحان کن» button opens exactly the page or tab its item names (same result as opening it directly); items without a destination show «فقط برای اطلاع» and no button |
| `lib.js` | local static server, browser launch, condition-based waits, synthetic seeds, invariants |

## Finding code (instead of reading index.html)

`tools/q.js` cuts one piece out of the app and prints it with readable line breaks and the real `index.html` line numbers:

```sh
node tools/q.js map                 # regions: first/last line, number of functions
node tools/q.js region cheques      # one region and its functions
node tools/q.js fn postDoc          # one function
node tools/q.js act lotVoid         # what a data-act button does
node tools/q.js form ledger         # what saving data-form="ledger" does
node tools/q.js writers ledger      # every place that writes or deletes records of a collection
node tools/q.js callers save        # every place a function is called
```

Long bodies stop after 200 lines (`--full` prints everything); `MIZ_ROOT=…` reads another copy.
The scanner (`tools/parse.js`) is checked by `01-wiring`: every function, action and form body it cuts must parse on its own.

## Change → tests to run

Run the rows that match what you changed, plus `00` and `01` (both take seconds). The full suite is for releases and for changes to `tests/lib.js`.

| You changed | Run |
|---|---|
| any button, form, menu, «تازه‌ها» or help entry | `01`, then `90` (menu) or `91` («تازه‌ها») |
| documents, posting (`postDoc`, `docVoid`), stock, lots, kardex | `20`, `30` |
| ledger, vouchers, accounting (`autoEntries`), person balances | `20` |
| backup, restore, export (`backupData`, `restoreApply`, `ghPack`) | `40`, `70` |
| calendar feed (`calFeed`), AI (`deid`, `aiCall`), deleting records, drafts | `75` |
| `sw.js`, `stashLatest`, `checkUpdate`, start-up and loading | `60`, `80`, `81` |
| render, tabs, domain pages | `10`, `90` |
| documentation in `docs/` | `05` |

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
