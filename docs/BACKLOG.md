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
| O3 | A new version is installed only if every pre-cached file downloaded and the shell is the real app | 4.23 (not yet released) | `tests/80-sw-shell.test.js` |
| T1 | Help page fixed; every menu entry opened by a test | 4.23 (not yet released) | `tests/90-menu.test.js` |
| T2 | Intermittent backup/restore test failure, part 1: test helper `settle()` now waits for writes in flight; mismatches now name what differs | 4.23 (not yet released) | `tests/40-backup-restore.test.js` |
| P-1 | Privacy hardening, first part | 4.23 (not yet released) | `tests/75-privacy.test.js` |

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
| WP-6 | Remove dead code (`vBiz`, `myAcctsOld`, `restoreJsonOld`, `fHint`) and unused icons (`icon-192.png`, `icon-512.png`) | 4 | WP-1, WP-3 |
| WP-7 | First module boundary: one writer for document postings | 4 | WP-1 to WP-3 |

## Known structural facts (not defects by themselves)

- Money is represented three ways: ledger rows, vouchers and document postings (`docs/DATA.md` §2).
- People exist both as `people` and as phone `contacts`.
- Calendar export exists twice: the legacy `.ics` feed and Google Calendar.
- About 200 empty error handlers (`catch(_){}`) hide failures. Review them only with test coverage in place.
