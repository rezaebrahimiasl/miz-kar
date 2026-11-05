# Decision register

Append-only. Status values: **approved** (owner), **pending** (owner must decide), **superseded**, **rejected**, **AI recommendation** (not yet decided). Engineering decisions with lasting design impact are also in [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md). IDs match [`../BACKLOG.md`](../BACKLOG.md).

## Pending owner decisions

| ID | Question | Options and effects | AI recommendation | Current behaviour (kept until decided) |
|---|---|---|---|---|
| DEC-1 | When a clinic visit is deleted, what happens to its fee row? | (a) keep it — money received or truly owed stays in the books; (b) void it — income/receivable drops, books may differ from reality if money was received; (c) ask each time | (a) | the fee row stays |
| DEC-2 | Stock-in with «در حساب‌ها ثبت نشود» | (a) keep — stock value ≠ inventory account (reported by the integrity page); (b) post against capital 3101 like opening stock — books balance, needs an approved treatment of existing lots; (c) remove the option | (b) | kept; reported |
| DEC-3 | Small differences (e.g. a balance of a few hundred toman from a payment that differs from its row) | (a) leave; (b) a write-off row to an account the owner chooses; (c) refund. No automatic tolerance | (b) per case | reported as «ماندهٔ جزئی» |
| SITE-1 | Is the shop site `https://asalereza.com` / `https://www.asalereza.com`, and does it allow cross-origin reads of the Store API? | confirm address; if CORS is missing, the site needs a header or a proxy | confirm | CSP allows both origins; CORS unverified |
| OR-1 | When to move to a separate origin | plan, backup, verification, rollback | after PH-1 | not started |
| ARAP-R / D1-R | Review integrity findings on the real phone; decide each repair | per row, through normal app actions | — | read-only reports |

## Approved decisions (selection; chronological)

| Date | Decision | Evidence |
|---|---|---|
| ≤ 2026-10-29 | Standing engineering policy (priorities, tests, no real-data changes, approvals) | HANDOFF 4.29; [PRODUCT_POLICIES.md](PRODUCT_POLICIES.md) |
| 2026-11-04 | 4.40 released (atomic storage); two minor items deferred to the next package («تازه‌ها» text, `applyData` error handling) — done in 4.41 | PR #1 |
| 2026-11-04 | Integrated 4.41 package approved without per-item approvals; DEC-1 untouched | PR #2 |
| 2026-11-04 | 4.41 submit lock: no expiry + one document per form (final check before release) | `00c25f1` |
| 2026-11-04 | ARAP scope: recompute `settled` with history, read-only prepayment section, integrity group; hand-settled rows never auto-reopened | PR #3 |
| 2026-11-04 | 4.43 scope ARAP-3, INT-2, ARAP-2; 4.44 LOT-1, SITE-1 | PR #4, #5 |
| 2026-11-04 | 4.45 TINY-1 (cause stated as one possibility, boundary tests) | PR #6 |
| 2026-11-06 | Publish this documentation system as a docs-only PR; merge only after independent review and owner confirmation; no app release for docs | this PR |

## Superseded

| Decision | Superseded by |
|---|---|
| Submit lock expiring after 20 s (`2e762fb`) | no expiry + `data-nid` (`00c25f1`) |
| Automatic `navigator.storage.persist()` at start-up | request only on the user's tap (4.41) |
| Google Fonts | bundled Vazirmatn (4.41) |
| Trusting the stored `settled` flag in row lists | `ledSync` recomputation (4.42) |

## Rejected

| Proposal | Reason |
|---|---|
| Publishing a same-origin preview of 4.40 | it would share production data; local-only preview chosen instead |
| Automatic repair or migration of D1 documents | data policy; reported only |
