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
| `25-money-stock-actions.test.js` | the click actions that write money or stock outside documents (`lotVoid`, `lotFixShort`, `lotMine`, `lotMineH`, `lotFixMine`, `chqUndo`, `pendOk`, `pendNo`, `lgSettle`, `logRestore`, `acctMerge`, `acctFix`): exact state change and invariants after each |
| `26-money-forms.test.js` | money forms «تسویه», «تسویهٔ همه», «وصول چک», «واگذاری چک»: exact ledger rows, settled flags, cheque status and invariants (`formSettle()`, `formSettleAll()`, `formChqClear()`, `formChqEndorse()`, `ledSettleIfPaid()`) |
| `27-doc-lot-ref-net.test.js` | WP-10: net profit (in, due, debt, asset, cost row), referral sale and its edit (partial payment carried over), lots (opening stock, consigned, edit of a bought lot with purchase-row history), pro-forma and letter without postings (`formNetSave()`, `formRefSale()`, `formLotSave()`, `formDocSave()`) |
| `28-small-money-forms.test.js` | WP-10: ledger row new/correction/edit/void, pending-payment split, commission, extra lot cost, sale from a lot and its price edit, packing and voiding it, production, recurring fill-in, voucher from a ledger row: exact rows and invariants |
| `29-receivables-person.test.js` | receivables follow-up: which receivables qualify (overdue or due within 7 days, open amount after linked and unlinked payments, not undated, not net creditors), one task per person (`recv-<person>`, no duplicates, reopened not repeated), reminder text prepared and logged but never sent, partial payment moves it on, full settlement closes it, no extra money rows; voiding a linked payment (full, one of two, payable) reopens the receivable and its follow-up, but not when other payments still cover it, when it was settled by hand, or after a same-amount correction; person page: documents and letters, notes naming the person, statement, contact history, only that person's |
| `30-docs.test.js` | document version restore and count-sheet restore |
| `40-backup-restore.test.js` | backup → clean device → identical data (plain and encrypted) · wrong passphrase and non-backup files rejected · restore keeps newer local edits, does not resurrect deletions, never removes local rows, takes a snapshot first (asks before restoring without one) · Excel export round trip |
| `41-sync-merge.test.js` | `syncMerge()` with synthetic payloads: one-sided edits (newer wins), both-sided edits (local kept + conflict with both copies, also at equal times; identical copies no conflict; open conflicts not overwritten), first sync (different copies → conflict), remote deletion vs an unsynced local edit (kept as a conflict, resolved either way), tombstones both ways against older/newer copies and their merge, records missing on either side, id-less entries, duplicate ids, idempotence, device-only `vault/bio` and conflicts list untouched, unsent counter, invariants, persistence after reload |
| `42-query-engine.test.js` | information engine: `qNorm` keeps only known fields/values and reports unreadable ones; `qExec` exact figures for sales, gifts, purchases, ledger, balance (= `personBal`), overdue, tasks, stock, with groups, dates, person and product filters; unknown person matches nothing; read-only and deterministic; whatever the AI returns only becomes a query; overdue = open amount incl. unlinked payments (as the follow-up); money totals per currency, never added together; offline answers (`askAnswer`) come from `qExec` |
| `50-workflows.test.js` | clinic visit with a fee (`visitOf`) and deleting it · beekeeping harvest → lot → sale · task paid with a voucher; invariants after each step |
| `60-offline.test.js` | service worker install, airplane-mode cold launch, offline create/edit, reopen, reconnect without duplicates or uploads |
| `70-backup-security.test.js` | no cloud upload without the encryption passphrase; encrypted upload decrypts to the same data |
| `75-privacy.test.js` | calendar feed carries no clinic-client names, phones, notes or case codes · AI de-identification removes names, phones, e-mail, links and addresses · deleting a record drops its unsaved drafts and keeps it in the trash |
| `80-sw-shell.test.js` | O2: the service worker may only store and serve the real app as the offline shell (navigation refresh, `stashLatest()`, ordinary fetch of `index.html`, new-worker install, upgrade from caches poisoned earlier) · O3: a new version whose shell is not the app or whose files fail to download (404, dropped) never activates and the last working cache stays complete; the real `index.html` is accepted byte-for-byte; 404/500/dropped responses never replace the shell. |
| `81-sw-shell-static.test.js` | O2: `isShellUrl()` matches only the app's own `/` and `index.html` (any query), `isApp()` accepts the real page and rejects pages without the version declaration — including the validation code itself. |
| `90-menu.test.js` | every menu entry opens without a page error (empty device and after a business cycle) · the Help page lists every entry with a description |
| `91-whatsnew.test.js` | «تازه‌ها»: every «امتحان کن» button opens exactly the page or tab its item names (same result as opening it directly); items without a destination show «فقط برای اطلاع» and no button |
| `92-ux.test.js` | v4.26: «امروز» as the start tab of a new session; message duration by length and tap-to-close; undo bar, message and quick-entry button never overlap (also inside the search sheet); search finds documents and cheques but never vault items or visit notes; «ابزارها» in Tasks and the «بعداً» filter; no automatic print preview after saving a document |
| `93-fixes427.test.js` | v4.27: search matches Persian and Latin digits (shared `nrm()` unchanged) and opens from «فاکتورها و اسناد» limited to documents; the automatic Google Calendar sign-in stays in the app when the internet does not answer (failed, portal HTML, no answer) and still signs in when it does; manual sign-in unchanged |
| `94-today-nav.test.js` | v4.28: «امروز» order (prayers → tasks → follow-ups → reminders → tip; first overdue task on the first screen; weekly-review reminder shown); «فاکتورها و اسناد» on the money tab and in «بیشتر»; display settings under «تنظیمات»; search placeholder; AI button only for questions and only with a key |
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
| ledger, vouchers, accounting (`autoEntries`), person balances | `20`, `25` |
| «Stock & money actions» (`actLotVoid` … `actAcctFix`), cheques, own accounts | `25` |
| «Money forms» (settle, settle all, clear/endorse cheque) | `26`, `29` |
| «پرسش از داده‌ها», offline answers in search (`askAnswer`), `qNorm`, `qExec`, `qHtml`, `aiRun`, `AI_Q` | `42` |
| receivables follow-up (`recvDue` … `recvAttn`, `markDirty`), person page (`viewPerson`) | `29`, `20` |
| document, lot, referral-sale and net-profit forms (`formDocSave` … `formNetSave`) | `27`, `20`, `30`, `50` |
| ledger, move, packing, production, commission, recurring and voucher forms (`formLedgerSave` … `formPendEdit`) | `28` |
| «امروز» (`vToday`), menu (`menuSheet`, `MENU_HIDE`, `REGROUP`), money tab header | `94`, `10`, `90` |
| clinic visits and fees, apiary/harvest lots, task payments | `50` |
| backup, restore, export (`backupData`, `restoreApply`, `ghPack`) | `40`, `70` |
| sync (`syncMerge`, `ghSync`, tombstones, conflicts, `confSave`) | `41`, `40`, `70` |
| calendar feed (`calFeed`), AI (`deid`, `aiCall`), deleting records, drafts | `75` |
| `sw.js`, `stashLatest`, `checkUpdate`, start-up and loading | `60`, `80`, `81` |
| render, tabs, domain pages | `10`, `90` |
| `toast()`, undo bar, global search (`runSearch`), Tasks header, start tab, saving documents | `92`, `93` |
| Google Calendar sign-in (`gcBoot`, `gcAuth`, `gcNetOk`) | `93` |
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
