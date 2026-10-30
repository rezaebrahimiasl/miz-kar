# Reza Desk: Engineering Backlog (public)

This list is public. Security and privacy details are tracked privately by the owner.
Priorities follow the project policy: reliability first, then maintenance cost, data integrity, architecture, and lastly new features.

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
| QE-2 | Offline answers in search go through `qExec` (new entities `income`, `expense`, `price`; balances per currency with goods owed); overdue uses `remOf` (unlinked payments count); money totals are kept per currency everywhere in the engine | not yet released | `tests/42-query-engine.test.js` |
| QE-1 | Information engine, first increment: `qNorm` (clean query), `qExec` (read-only data with record references), `qHtml`; «پرسش از داده‌ها» uses it (output identical except: a person not in «افراد» now matches nothing) | not yet released | `tests/42-query-engine.test.js` |
| L-1 | Voiding a payment linked to a receivable/payable reopens it (history entry) when the live linked payments no longer cover it and it had been settled by payments; the auto-closed follow-up reopens; a correction keeps the link | not yet released | `tests/29-receivables-person.test.js` |
| R-3 | Receivables follow-up: one task per person for overdue or soon-due receivables, closed or moved on by any payment, reminder text prepared (never sent); Today offers it | not yet released | `tests/29-receivables-person.test.js` |
| R-6 | Person page: documents and letters, notes naming the person, wider contact history | not yet released | `tests/29-receivables-person.test.js` |
| SAFE-1 | Silent failures fixed: `restoreApply` asks before restoring when the «before restore» snapshot cannot be made; `undoDo` reports a partial undo instead of «✓»; `confSave` never drops open conflicts (it kept only 80) | 4.29 (not yet released) | `40` (h), `92` G, `41` |
| SYNC-1 | `syncMerge` regression tests; fixed: another device's fingerprint tombstone deleted this device's `vault/bio`; a duplicated id in a payload became a spurious conflict; conflicts reset the unsent flag mid-merge; a remote deletion of a record edited here since the last sync, and different copies on a device's first sync, now open a conflict instead of being decided silently | 4.29 (not yet released) | `tests/41-sync-merge.test.js` |
| WP-10c | The last 13 submit branches that wrote `ledger` directly moved into named functions (`formLedgerSave`, `formLedgerEditSave`, `formVoidLedger`, `formVoidMove`, `formMoveEditSave`, `formCommPay`, `formLotExtra`, `formMoveSave`, `formRecurSave`, `formRepackSave`, `formProdSave`, `formVoucherSave`, `formPendEdit`); no submit branch writes `ledger` any more | 4.29 (not yet released) | `tests/28-small-money-forms.test.js` |
| WP-10b | Document, lot, referral-sale and net-profit forms moved into named functions (`formDocSave`, `formLotSave`, `formRefSale`, `formNetSave`); bodies unchanged | 4.29 (not yet released) | `tests/27-doc-lot-ref-net.test.js` |
| UX-1 | «امروز» shows work before system reminders; weekly-review reminder fixed; «فاکتورها و اسناد» on the money tab and in «بیشتر»; display settings in «تنظیمات»; AI question button in search | 4.28 | `tests/94-today-nav.test.js` |
| WP-9 | Money and stock click actions moved out of `switch(a)` into named functions («Stock & money actions») | 4.25 (not yet released) | `tests/25-money-stock-actions.test.js`, `tests/50-workflows.test.js` |

## Decisions needed (owner)

| ID | Question | Current behaviour | Options |
|---|---|---|---|
| DEC-1 | When a clinic visit is deleted, what should happen to its fee row (`ledger` row with `visitOf`)? | `voidVisit` voids only the visit; the fee row stays, so the receivable or receipt remains in the books (`tests/50-workflows.test.js` records this). | (a) keep as is: money owed or received is not erased with a clinical note; (b) void the fee row together with the visit; (c) ask on each deletion. Any change needs a regression test and a review of fees that were already received. |

## Open, in priority order

| ID | Item | Priority | Prerequisite |
|---|---|---|---|
| T3 | Intermittent backup/restore test failure, part 2: not reproduced in 36 runs of `40` (8 in parallel, then 6 in parallel with 6 CPU-burning processes on 2 cores). Instrumented run: restore is fully awaited, fingerprint and backup are taken atomically, and nothing writes app data after start-up except the daily snapshot (separate database). Classified as test timing, not an app defect; `sigDiff` will name the difference if it recurs | 3 | the diagnostic message from the next occurrence |
| WP-3 | Read-only data-integrity page, including documents affected by D1 before 4.21 | 3 | WP-1 |
| P-x | Further privacy hardening (tracked privately) | 1 | owner decision |
| WP-5 | One-command version bump plus optional automatic test runs | 2 | WP-1, WP-4 |
| O4 | Bundle the Vazirmatn font locally (no remote font) | 2 | — |
| O5 | Voice input: clear message when offline | 4 | — |
| O6 | Show whether the browser granted persistent storage | 3 | — |
| WP-7 | First module boundary: one writer for document postings | 4 | WP-1 to WP-3 |

## Known structural facts (not defects by themselves)

- Money is represented three ways: ledger rows, vouchers and document postings (`docs/DATA.md` §2).
- People exist both as `people` and as phone `contacts`.
- Calendar export exists twice: the legacy `.ics` feed and Google Calendar.
- About 200 empty error handlers (`catch(_){}`) hide failures. Review them only with test coverage in place.
