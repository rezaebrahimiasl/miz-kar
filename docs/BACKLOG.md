# Reza Desk: Engineering Backlog (public)

This list is public. Security and privacy details are tracked privately by the owner.
Priorities follow the project policy: reliability first, then maintenance cost, data integrity, architecture, and lastly new features.

State: v4.41 on branch `eng-4.41` (from `main` `d8711a7`, v4.40). «released by 4.40» means the change is in `main` at `d8711a7`; the exact earlier release was not re-derived. Status was checked against the code for v4.41, not copied from older notes.

## Done

| ID | Item | Release | Evidence |
|---|---|---|---|
| D1 | «برگرداندن این نسخه» (restore a document version) made two versions live | 4.21 | `tests/30-docs.test.js`; phone checks |
| O1 | Cloud backup uploads only with an encryption passphrase | 4.21 | `tests/70-backup-security.test.js`; phone checks |
| T0 | Repository test suite: static, smoke, documents, offline, backup security | 4.21 | `tests/` |
| O2 | Service worker stores and serves only the real app as the offline shell | 4.22 | `tests/80-sw-shell.test.js`, `tests/81-sw-shell-static.test.js`; phone checks |
| WP-1 | Accounting, inventory and backup/restore regression tests | — | `tests/20-accounting.test.js`, `tests/40-backup-restore.test.js` |
| WP-4 | These documents and `tests/05-docs.test.js` | — | `tests/05-docs.test.js` |
| O3 | A new version is installed only if every pre-cached file downloaded and the shell is the real app | 4.23 | `tests/80-sw-shell.test.js` |
| T1 | Help page fixed; every menu entry opened by a test | 4.23 | `tests/90-menu.test.js` |
| T2 | Intermittent backup/restore test failure, part 1: test helper `settle()` now waits for writes in flight; mismatches now name what differs | 4.23 | `tests/40-backup-restore.test.js` |
| P-1 | Privacy hardening, first part | 4.23 | `tests/75-privacy.test.js` |
| T4 | «تازه‌ها»: «امتحان کن» opens its own destination; items without one are labelled «فقط برای اطلاع» | 4.24 | `tests/91-whatsnew.test.js` |
| WP-8 | Code-finding tool (`tools/q.js`) and static wiring test | — | `tests/01-wiring.test.js` |
| WP-6 | Dead code removed (`vBiz`, `myAcctsOld`, `restoreJsonOld`, `fHint`, the unused `tgJump` action); the unused icons `icon-192.png`, `icon-512.png` are kept (old installs may still ask for them) | 4.28 | `tests/05-docs.test.js` |
| WP-10a | Money forms moved into named functions (`formSettle`, `formSettleAll`, `formChqClear`, `formChqEndorse`) with one shared `ledSettleIfPaid()` instead of three copies | 4.28 | `tests/26-money-forms.test.js` |
| REV-1 | Review fixes H1, H2, M1, M2: `recvBatch` around every click/submit action and `restoreApply`; shared text only fills the assistant; `asNums` money only with currency/unit or money words; `aiShield` in `aiCall` removes names of people with a clinical record | 4.29 line, released by 4.40 | `tests/45-safety-fixes.test.js` |
| AS-1 | One input and the assistant: «با یک جمله» works without AI too; shared text, voice and pasted bank messages/bills/questions are routed; several actions per request, numbers checked against the user's words, ambiguous people chosen by the user, financial actions only through their forms; bank messages suggest the pending recurring payment, same-amount open invoices or warn of duplicates; weekly review shows cheques, pending confirmations, receivables without follow-up and the week's money | 4.29 line, released by 4.40 | `tests/44-assistant.test.js` |
| QE-3 | Engine entities `cheques` (in progress, due/overdue, per direction and currency), `profit` (per Jalali month from `plRange`, toman only, other currencies reported), `statement` (from `stmtRows`, per currency, opening/closing); expenses by category through `expense`. «پرسش از داده‌ها» (now also in the menu) has a filter form for these four that runs on the phone; the AI instructions list them | 4.29 line, released by 4.40 | `tests/43-query-capabilities.test.js` |
| QE-2 | Offline answers in search go through `qExec` (new entities `income`, `expense`, `price`; balances per currency with goods owed); overdue uses `remOf` (unlinked payments count); money totals are kept per currency everywhere in the engine | 4.29 line, released by 4.40 | `tests/42-query-engine.test.js` |
| QE-1 | Information engine, first increment: `qNorm` (clean query), `qExec` (read-only data with record references), `qHtml`; «پرسش از داده‌ها» uses it (output identical except: a person not in «افراد» now matches nothing) | 4.29 line, released by 4.40 | `tests/42-query-engine.test.js` |
| L-1 | Voiding a payment linked to a receivable/payable reopens it (history entry) when the live linked payments no longer cover it and it had been settled by payments; the auto-closed follow-up reopens; a correction keeps the link | 4.29 line, released by 4.40 | `tests/29-receivables-person.test.js` |
| R-3 | Receivables follow-up: one task per person for overdue or soon-due receivables, closed or moved on by any payment, reminder text prepared (never sent); Today offers it | 4.29 line, released by 4.40 | `tests/29-receivables-person.test.js` |
| R-6 | Person page: documents and letters, notes naming the person, wider contact history | 4.29 line, released by 4.40 | `tests/29-receivables-person.test.js` |
| SAFE-1 | Silent failures fixed: `restoreApply` asks before restoring when the «before restore» snapshot cannot be made; `undoDo` reports a partial undo instead of «✓»; `confSave` never drops open conflicts (it kept only 80) | 4.29 line, released by 4.40 | `40` (h), `92` G, `41` |
| SYNC-1 | `syncMerge` regression tests; fixed: another device's fingerprint tombstone deleted this device's `vault/bio`; a duplicated id in a payload became a spurious conflict; conflicts reset the unsent flag mid-merge; a remote deletion of a record edited here since the last sync, and different copies on a device's first sync, now open a conflict instead of being decided silently | 4.29 line, released by 4.40 | `tests/41-sync-merge.test.js` |
| WP-10c | The last 13 submit branches that wrote `ledger` directly moved into named functions (`formLedgerSave`, `formLedgerEditSave`, `formVoidLedger`, `formVoidMove`, `formMoveEditSave`, `formCommPay`, `formLotExtra`, `formMoveSave`, `formRecurSave`, `formRepackSave`, `formProdSave`, `formVoucherSave`, `formPendEdit`); no submit branch writes `ledger` any more | 4.29 line, released by 4.40 | `tests/28-small-money-forms.test.js` |
| WP-10b | Document, lot, referral-sale and net-profit forms moved into named functions (`formDocSave`, `formLotSave`, `formRefSale`, `formNetSave`); bodies unchanged | 4.29 line, released by 4.40 | `tests/27-doc-lot-ref-net.test.js` |
| UX-1 | «امروز» shows work before system reminders; weekly-review reminder fixed; «فاکتورها و اسناد» on the money tab and in «بیشتر»; display settings in «تنظیمات»; AI question button in search | 4.28 | `tests/94-today-nav.test.js` |
| ATOM | Atomic storage: `Store.tx` (one transaction per write, memory after commit) and `Store.batch` (posting, void, merge, restore, sync, conflict choice, undo, delete all-or-nothing); cloud mode refuses multi-record operations | 4.40 | tests 59–67 |
| M3 | Assistant proposal is done only after the submit of the form it opened wrote data. 4.29 (`asAfter`); 4.41: counted from the start of that submit, so another write while the form was open (sync, a recurring job) no longer marks a failed save done | 4.29, refined 4.41 | `tests/45-safety-fixes.test.js`, `tests/69-…` |
| M4 | Confirming a recurring payment from a bank message keeps the reference, evidence and receipt key. 4.29 (`rcptPend`); 4.41: one operation with its pair row (`pendConfirm()`: all or nothing), the same message never confirms a second row, a double tap confirms once | 4.29, refined 4.41 | `tests/45-…`, `tests/69-…` |
| WP-3 | Read-only data-integrity page (`integCheck()`, `integSheet()`, `integText()`), including documents with two live versions from D1 before 4.21; no automatic repair; no names, amounts or clinical text | 4.41 | `tests/68-integrity.test.js` |
| WP-5 | One version tool `tools/version.js` (`check`, `set X.Y [--dry]`); no git; release notes and HANDOFF stay manual and are checked | 4.41 | `tests/69-…` |
| O4 | Vazirmatn bundled (`fonts/Vazirmatn-wght.woff2`, 111 KB, SIL OFL 1.1 with `fonts/OFL.txt`); no font service in the page, printed documents, CSP or service worker | 4.41 | `tests/69-…` |
| O5 | Voice input: offline, unsupported, permission denied, no microphone, no speech and cancel each have a message; only a service failure while online disables the built-in recogniser, with a retry; a second press finishes | 4.41 | `tests/69-…` |
| O6 | Persistent storage: status and space used on the backup page; requested only on the user's tap (the automatic request at start-up was removed) | 4.41 | `tests/69-…` |
| R-1 | Restore from a local copy or a cloud version: a failure (or cloud mode) shows a message, changes nothing, and allows a smaller cloud copy only after success | 4.41 | `tests/69-…` |
| WP-7 | Review of who writes document postings: `postDoc` and `docVoid` are atomic; production and stock count are not (see WP-7b). Documented in `docs/ARCHITECTURE.md` §3.7 | 4.41 (review only) | `docs/ARCHITECTURE.md` |
| WP-9 | Money and stock click actions moved out of `switch(a)` into named functions («Stock & money actions») | 4.25 line, released by 4.40 | `tests/25-money-stock-actions.test.js`, `tests/50-workflows.test.js` |

## Decisions needed (owner)

| ID | Question | Current behaviour | Options |
|---|---|---|---|
| DEC-1 | When a clinic visit is deleted, what should happen to its fee row (`ledger` row with `visitOf`)? | `voidVisit` voids only the visit; the fee row stays, so the receivable or receipt remains in the books (`tests/50-workflows.test.js` records this). | (a) keep as is: money owed or received is not erased with a clinical note; (b) void the fee row together with the visit; (c) ask on each deletion. Any change needs a regression test and a review of fees that were already received. |

## Open, in priority order

| ID | Item | Priority | Prerequisite |
|---|---|---|---|
| T3 | Intermittent backup/restore test failure, part 2: not reproduced in 36 runs of `40` (8 in parallel, then 6 in parallel with 6 CPU-burning processes on 2 cores). Instrumented run: restore is fully awaited, fingerprint and backup are taken atomically, and nothing writes app data after start-up except the daily snapshot (separate database). Classified as test timing, not an app defect; `sigDiff` will name the difference if it recurs | 3 | the diagnostic message from the next occurrence |
| P-x | Further privacy hardening (tracked privately) | 1 | owner decision |
| PH-1 | Real-phone check of 4.40 and 4.41 (checklist: backup first, separate test address, synthetic data); no phone result for 4.40 has been recorded in the repository | 1 | owner |
| WP-7b | Production (`formProdSave()`) and stock count (`count` form) write their postings one by one; a failure midway leaves half a production or count. Move both into `Store.batch` (factory + failure-injection tests) | 2 | WP-7 |
| D1-R | Owner review of what «عیب‌یابی داده‌ها» lists on the real phone (D1 pairs, orphan rows); each repair is a separate, approved action | 2 | WP-3, PH-1 |
| WP-5b | Optional: run the tests from the version tool | 4 | WP-5 |
| UX-2 | «·» is still a separator elsewhere in the app (also inside stored text); literal `${…}` image addresses return 404 | 4 | — |
| OR-1 | Separate origin for the app's data (shared `github.io` origin) — separate path with its own approval and migration plan | 2 | owner approval |

## Known structural facts (not defects by themselves)

- Money is represented three ways: ledger rows, vouchers and document postings (`docs/DATA.md` §2).
- People exist both as `people` and as phone `contacts`.
- Calendar export exists twice: the legacy `.ics` feed and Google Calendar.
- Persistent storage is no longer requested automatically (O6, owner rule): a new install is protected only after the user taps the button; until then the browser may evict data under storage pressure.
- About 200 empty error handlers (`catch(_){}`) hide failures. Review them only with test coverage in place.
