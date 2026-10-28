# Reza Desk: Engineering Backlog (public)

This list is public. Security and privacy details are tracked privately by the owner.
Priorities follow the project policy: reliability first, then maintenance cost, data integrity, architecture, and lastly new features.

## Done

| ID | Item | Release | Evidence |
|---|---|---|---|
| D1 | «برگرداندن این نسخه» (restore a document version) made two versions live | 4.21 | `tests/30-docs.test.js`; phone checks |
| O1 | Cloud backup uploads only with an encryption passphrase | 4.21 | `tests/70-backup-security.test.js`; phone checks |
| T0 | Repository test suite: static, smoke, documents, offline, backup security | 4.21 | `tests/` |

## In review

| ID | Item |
|---|---|
| WP-1 | Accounting, inventory and backup/restore regression tests (`tests/20-accounting.test.js`, `tests/40-backup-restore.test.js`) |
| WP-4 | These documents and `tests/05-docs.test.js` |

## Open, in priority order

| ID | Item | Priority | Prerequisite |
|---|---|---|---|
| O2 | Service worker: store a page as the offline shell only if it is really the app | 1 | WP-1 |
| O3 | Service worker: install a new version only if every pre-cached file downloaded | 1 | O2 confirmed on the phone |
| WP-3 | Read-only data-integrity page, including documents affected by D1 before 4.21 | 3 | WP-1 |
| P-x | Privacy hardening items (tracked privately) | 1–3 | owner decisions |
| WP-5 | One-command version bump plus optional automatic test runs | 2 | WP-1, WP-4 |
| O4 | Bundle the Vazirmatn font locally (no remote font) | 2 | O2, O3 |
| O5 | Voice input: clear message when offline | 4 | O2, O3 |
| O6 | Show whether the browser granted persistent storage | 3 | O2, O3 |
| WP-6 | Remove dead code (`vBiz`, `myAcctsOld`, `restoreJsonOld`, `fHint`) and unused icons (`icon-192.png`, `icon-512.png`) | 4 | WP-1, WP-3 |
| WP-7 | First module boundary: one writer for document postings | 4 | WP-1 to WP-3 |

## Known structural facts (not defects by themselves)

- Money is represented three ways: ledger rows, vouchers and document postings (`docs/DATA.md` §2).
- People exist both as `people` and as phone `contacts`.
- Calendar export exists twice: the legacy `.ics` feed and Google Calendar.
- About 200 empty error handlers (`catch(_){}`) hide failures. Review them only with test coverage in place.
