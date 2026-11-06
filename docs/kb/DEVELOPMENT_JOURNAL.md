# Development journal

Append-only, newest last. One entry per implementation stage: what was built, commit, review, test outcome with its commit and date. The full per-version log is [`../../HANDOFF.md`](../../HANDOFF.md); this journal indexes it and records the 4.40+ release cycle precisely. Results marked **verified** were produced by running the tests; **reported** means taken from an earlier report without re-running.

| Date | Stage | Commits | Review | Tests (commit, result) |
|---|---|---|---|---|
| 2026-10-10 … 10-27 | Versions 0.6.2 → 4.21: features as in [CHANGELOG.md](CHANGELOG.md); 4.21 fixes D1 (two live document versions) | see CHANGELOG | owner reviews per version | NOT RECOVERED per version (HANDOFF.md notes some) |
| 2026-10-28 | WP-1 tests, WP-4 docs + docs consistency test, 4.22–4.24 service-worker hardening | `142be6e` (merge WP-4) | — | reported in HANDOFF.md |
| 2026-10-29 | 4.25–4.29: independent audit fixes, M3/M4 (`4b6a179`), standing policy | — | independent audit (25 items) | reported |
| 2026-10-30 … 11-01 | 4.30–4.39: parts `js/core.js`, `js/engine.js`, `js/backup.js`; receivables per person; clinic, calendar, timeline | `cf62003` = 4.39 | owner per release | reported |
| 2026-11-03 | 4.40 stage 1 `Store.tx`, stage 2 `Store.batch` (11 commits `4d71498`…`36c2fe7`), several review/fix cycles | PR #1 → `d8711a7` | independent reviewer (six issues fixed) | `36c2fe7`: 367 passed, 0 failed — verified |
| 2026-11-04 | 4.41 integrated package: WP-3 integrity page, M3/M4 refinements, O4 font, O5 voice, O6 storage, R-1, WP-5 version tool; then D1-2, DUP-1, PUR-1, HON-1, SH-1, WP-7b; review fixes; lock without expiry + `data-nid` | `d159520`, `33a14c4`, `2e762fb`, `00c25f1`; PR #2 → `b0abeb9` | independent review (1 high, 1 medium, 3 low fixed) | `00c25f1`: 407 passed, 0 failed — verified |
| 2026-11-04 | 4.42 ARAP: `ledSnap`/`ledSync`, prepayment section, `ledSuspect` | `497d0bf`; PR #3 → `812e66a` | focused self-review | `497d0bf`: 420 passed, 0 failed — verified |
| 2026-11-04 | 4.43 ARAP-3, INT-2, ARAP-2; review fix (settling direction only) | `cc5609a`, `90eebff`; PR #4 → `1a9ed85` | independent review (no blocker; 1 medium fixed) | `90eebff`: 423 passed, 0 failed — verified |
| 2026-11-04 | 4.44 LOT-1, SITE-1; review fixes (follow-up/message after commit) | `8b56253`, `04a0ccf`; PR #5 → `9ade5e7` | independent review (1 high, 2 medium fixed) | `04a0ccf`: 430 passed, 0 failed — verified |
| 2026-11-04 | 4.45 TINY-1 + docs; corrections and boundary tests | `357a49c`, `0582a88`; PR #6 → `5dfabe5` | — | `0582a88`: 432 passed, 0 failed — verified |
| 2026-11-05 | Technical handover package (no code change) | — | — | `5dfabe5`: 429 passed, 3 failed (TEST-57 date-dependent ×2, timeout ×1; no app defect) — verified |
| 2026-11-06 | Permanent knowledge system `docs/kb/` (this folder); stale state lines corrected in ARCHITECTURE, BACKLOG, HANDOFF | docs-only PR | awaiting independent review | not needed (no code change); docs test 05 run |
| 2026-11-06 | PR #7 review fixes: privacy paths verified per integration, OR-1 wording unified, sync wording vs `syncMerge`, requirement vs implemented (offline, `hist`); new [CALCULATION_RULES.md](CALCULATION_RULES.md) extracted from code at `5dfabe5` | docs-only, PR #7 | awaiting independent review | docs test 05, link/identifier check, privacy scan (see PR) |
| 2026-11-06 | 4.46 stabilisation (branch `stabilize-4.46`, not committed): lot-save messages after commit (LOT-2), weekday-independent tests 57 and 67 | `edaaad3`; PR #8 | independent review: 1 important (cloud mode messages) — fix uncommitted | working tree: 431 passed, 1 failed (67, weekday, fails on `daf542c` too) → 67 fixed and passes alone; 57, 67, 76 proven to fail on `daf542c` — verified |
| 2026-11-06 | 4.46 released (PR #8 → `71d3fb6`, Pages `7592368725` success) after two review fixes (cloud mode messages) | `edaaad3`, `e08c8c0`, `2c65d54`, `9aef723` | independent review ×2 | `2c65d54`: 435 passed, 0 failed — verified |
| 2026-11-06 | 4.47: decisions page, amani return, label unification, CI workflow, `MIZ_NOW`, tests 77/78; independent accountant review (AUD-1…8, not fixed) | branch `release-4.47` | accountant review (synthetic probes) | see the PR |
