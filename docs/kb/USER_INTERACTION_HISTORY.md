# Owner interaction history

Chronological record of the owner's requests, corrections, approvals and refusals that shaped the project. Labels: **[approved]**, **[request]**, **[correction]**, **[rejected]**, **[deferred]**. Personal data (real people's names, amounts, clinical details) is never recorded here; a reported real case is described generically.

## Sources and what could not be recovered

- **2026-10-10 … 2026-11-03:** the per-version entries in [`../../HANDOFF.md`](../../HANDOFF.md) record what the owner asked for in each version (Persian until 4.29), and the in-app release notes ([CHANGELOG.md](CHANGELOG.md)). The original conversation messages of that period are **NOT RECOVERED** (earlier chats are not in the repository and were not available to this documentation pass). Where HANDOFF.md says «کاربر گفت / خواست», that is the best surviving evidence.
- **2026-11-03 (part):** recovered only as a summary in the AI's working notes; individual messages **NOT RECOVERED**.
- **2026-11-04 … 2026-11-06:** recovered from the session record (24 owner messages); summarised below.

## 2026-10-10 → 2026-11-03 (summary from HANDOFF.md)

| Period / versions | Owner direction (as recorded) |
|---|---|
| 0.6–2.x (10–12 Oct) | first versions: people, tasks, money in million toman, Jalali dates, offline PWA |
| 3.4–3.20 (13–18 Oct) | sales and shipping unified, smart packing, invoice and statement, commission, purchase flow, correct balances and double entry |
| 3.21–3.45 (18 Oct) | bank accounts, soft lock dates, documents unified, print accuracy, vault biometric, assets, receipts from SMS, multi-device sync and data safety |
| 3.46–3.99 (19–20 Oct) | staged UX reviews (menu, today, form intelligence, data quality, insights), clinic redesign, journal-style vouchers, filters remembered everywhere, undo rules, licence sales, «rial never alone» rule |
| 4.00–4.29 (21–29 Oct) | regular meetings; independent audit with 25 fixes approved by the owner; standing engineering policy; tests and documentation work packages |
| 4.30–4.39 (30 Oct–1 Nov) | parts extraction, receivables per person, price confirmation, clinic workspace, appointments, unified calendar, person timeline — each release approved individually |
| 3 Nov | read-only architecture audit; atomic-storage plan (stage 1 and 2) approved; Stage 3 (integrity monitor) explicitly **not** to start yet; separate-origin migration decided but needs its own approval |

## 2026-11-04 → 2026-11-06 (recovered)

| Date (Tehran) | Owner message (summary) | Label |
|---|---|---|
| 11-04 05:36 | Final report of 4.40 reviewed: no code fixes now; two minor items to the next package; prepare a real-phone checklist and stop | [deferred] [request] |
| 11-04 05:48 | Release of 4.40 authorised: push `stage2-final`, open PR, do not merge | [approved] |
| 11-04 06:13 | Integrated 4.41 package (WP-3, M3, M4, O4–O6, WP-5, WP-7, security review, docs) — no per-item approvals; DEC-1 untouched | [approved] |
| 11-04 06:48 | Complete all remaining work in one cycle: D1 (`updated` after the 4.21 fix), purchase paths, invoice gender in print, sharing, UX | [request] |
| 11-04 07:32 | Final check before merge: can the 20 s lock expiry create duplicate documents? Add a regression test; fix minimally | [correction] |
| 11-04 07:47 | Merge and publish 4.41 | [approved] |
| 11-04 08:11 | Investigate a reported client whose balance on the person page and the money tab's debt list disagree — diagnose only | [request] |
| 11-04 08:20 | ARAP fix approved with rules: hand-settled rows never auto-reopened; no real data changed | [approved] |
| 11-04 08:23 / 08:34 / 08:38 | Quota limits; merge and publish 4.42 after the full suite | [approved] |
| 11-04 10:42 | Diagnose three new issues (overpayment balanced by a document, integrity findings not navigable, shop-site sync) | [request] |
| 11-04 10:52 | 4.43 scope approved (ARAP-3, INT-2, ARAP-2); site sync, LOT-1, DEC-1/2 out of scope | [approved] |
| 11-04 11:19 | Full engineering management mandate (4.43 review, SITE-1, LOT-1, DEC-1/2 report, UX, mobile test, origin plan) with token management | [request] |
| 11-04 11:43 | Merge PR #4, retarget and merge PR #5, publish 4.44 | [approved] |
| 11-04 13:19 | Focused audit round; a small balance of the reported client to be explained without changing data; no commit without permission | [request] |
| 11-04 13:37 / 14:24 | Commit, push and PR for 4.45; then corrections: state docs, wording of TINY-1 as a possibility, boundary tests | [approved] [correction] |
| 11-04 14:30 | Merge and publish 4.45 | [approved] |
| 11-05 20:34 / 20:52 | Technical handover package (no code changes); finalise with checksums and privacy check | [request] |
| 11-06 02:20 | Build and publish this permanent knowledge system as a docs-only PR; wait for independent review before merging | [approved] |
