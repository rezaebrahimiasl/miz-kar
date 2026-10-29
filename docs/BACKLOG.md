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
| WP-6 | Dead code removed (`vBiz`, `myAcctsOld`, `restoreJsonOld`, `fHint`, the unused `tgJump` action); the unused icons `icon-192.png`, `icon-512.png` are kept (old installs may still ask for them) | 4.28 (not yet released) | `tests/05-docs.test.js` |
| WP-10a | Money forms moved into named functions (`formSettle`, `formSettleAll`, `formChqClear`, `formChqEndorse`) with one shared `ledSettleIfPaid()` instead of three copies | 4.28 (not yet released) | `tests/26-money-forms.test.js` |
| UX-1 | «امروز» shows work before system reminders; weekly-review reminder fixed; «فاکتورها و اسناد» on the money tab and in «بیشتر»; display settings in «تنظیمات»; AI question button in search | 4.28 (not yet released) | `tests/94-today-nav.test.js` |
| WP-9 | Money and stock click actions moved out of `switch(a)` into named functions («Stock & money actions») | 4.25 (not yet released) | `tests/25-money-stock-actions.test.js`, `tests/50-workflows.test.js` |

## Decisions needed (owner)

| ID | Question | Current behaviour | Options |
|---|---|---|---|
| DEC-1 | When a clinic visit is deleted, what should happen to its fee row (`ledger` row with `visitOf`)? | `voidVisit` voids only the visit; the fee row stays, so the receivable or receipt remains in the books (`tests/50-workflows.test.js` records this). | (a) keep as is: money owed or received is not erased with a clinical note; (b) void the fee row together with the visit; (c) ask on each deletion. Any change needs a regression test and a review of fees that were already received. |

## Open, in priority order

| ID | Item | Priority | Prerequisite |
|---|---|---|---|
| T3 | Intermittent backup/restore test failure, part 2: a rarer residual case under heavy parallel load (cause not yet known; test-only, never a false pass) | 2 | the diagnostic message from the next occurrence |
| WP-3 | Read-only data-integrity page, including documents affected by D1 before 4.21 | 3 | WP-1 |
| P-x | Further privacy hardening (tracked privately) | 1 | owner decision |
| WP-5 | One-command version bump plus optional automatic test runs | 2 | WP-1, WP-4 |
| O4 | Bundle the Vazirmatn font locally (no remote font) | 2 | — |
| O5 | Voice input: clear message when offline | 4 | — |
| O6 | Show whether the browser granted persistent storage | 3 | — |
| WP-7 | First module boundary: one writer for document postings | 4 | WP-1 to WP-3 |
| WP-10 | Form submit branches that still write `ledger` directly: 40 calls in 17 branches (`doc` 5, `lot` 6, `refsale` 6, `net` 5, `pendEdit` 3, `ledger` 2, `moveEdit` 2, `prod` 2, `comm`, `ledgerEdit`, `lotExtra`, `move`, `recur`, `repack`, `void`, `voidMove`, `voucher` 1 each; `node tools/q.js writers ledger`). Same method as WP-10a: a test per group first, then move. | 3 | WP-10a |

## Known structural facts (not defects by themselves)

- Money is represented three ways: ledger rows, vouchers and document postings (`docs/DATA.md` §2).
- People exist both as `people` and as phone `contacts`.
- Calendar export exists twice: the legacy `.ics` feed and Google Calendar.
- About 200 empty error handlers (`catch(_){}`) hide failures. Review them only with test coverage in place.
