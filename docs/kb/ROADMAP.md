# Roadmap

Prioritised. IDs as in [`../BACKLOG.md`](../BACKLOG.md); decisions in [DECISION_REGISTER.md](DECISION_REGISTER.md). Update when priorities change (dated note at the end).

## Now (needs the owner)

1. **PH-1** — real-phone check of 4.45 (checklist in [AI_CONTINUATION_GUIDE.md](AI_CONTINUATION_GUIDE.md) §6).
2. **ARAP-R / D1-R** — review the integrity page findings on the phone; decide each repair.
3. **DEC-1, DEC-2, DEC-3, SITE-1** — decisions; each then becomes a small, tested package.

## Next (technical, low risk)

1. **TEST-57** — make the calendar test independent of the weekday (test-only change).
2. Phone Back after opening a record from the integrity page (verify; fix if it closes the stack).
3. Lot save: show the two inner success toasts only after the commit.
4. Follow-up reopen for a reopened receivable without a due date in the follow-up window.
5. **UX-2** — the four 404 image requests (find the cause first); «·» separators only with a data plan.

## Later (architecture)

1. **Modular extraction**, one part at a time, same rules as ADR-006: first the pure read-only money calculations (`remMap`, `personBal`, `autoEntries`), then diagnostics (`integCheck`), then the money forms. No rewrite.
2. **External observer** stages O1–O4 ([DATA_ARCHITECTURE.md](DATA_ARCHITECTURE.md) §8), read-only, starting with a shared rule list used by both the integrity page and the tests.
3. **OR-1 separate origin** — migration plan with backup, verification and rollback; explicit approval.
4. **AI** — keep it outside the source of truth; extend the information engine's read-only capabilities; any write as a proposal into a normal form.

## Change notes

- 2026-11-06: initial roadmap from BACKLOG and the 4.45 handover.
