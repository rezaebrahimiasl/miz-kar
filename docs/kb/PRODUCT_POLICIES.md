# Product and engineering policies (the owner's standing rules)

Source: the owner's stated rules as recorded in `HANDOFF.md` (sections «قواعد ثابت», 4.29 standing policy), the release and review conversations of 2026-11-03…06, and the code that enforces them. A rule changes only by an explicit owner decision recorded in [DECISION_REGISTER.md](DECISION_REGISTER.md).

## 1. Data and safety (non-negotiable)

1. **Offline first.** Every core workflow works without internet; cloud backup, sync, calendars and AI are optional.
2. **The phone's data is the truth.** No test data, Excel file or other copy replaces it.
3. **No automatic change to real data.** No auto-merge, auto-delete, auto-repair, auto-reconcile or migration without the owner's explicit, per-case approval and a reviewed recovery plan. Diagnostics are read-only first.
4. **No silent upload.** Sensitive data leaves the phone only encrypted (cloud backup) or de-identified (AI); never card or account numbers, keys or tokens in code, chat, memory or logs. The Gemini key stays only on the phone.
5. **Clinical data** goes to AI only after de-identification (`aiShield`, `deid`).
6. **Every record is editable and keeps its edit history** (`hist`).
7. **Financial meaning is the owner's decision.** No AI or engineer changes accounting meaning (what posts where, write-offs, tolerances) on its own — see DEC-1/2/3.

## 2. Engineering

1. Priorities in order: reliability and regression tests → lower maintenance cost (docs, automated checks, gradual module boundaries, no big rewrites) → data integrity → incremental architecture → new features.
2. Inspect the current repository first; separate verified facts, hypotheses, risks and recommendations.
3. Small, reviewable, reversible changes; one branch and one PR per package; never force-push; never rewrite history; rollback by a new commit.
4. Every bug fix gets a regression test that fails on the previous commit (`MIZ_ROOT`).
5. Never claim a test, deployment or device check succeeded without direct evidence; label results with commit and date.
6. No commit, push, merge, release or deployment without the owner's fresh explicit authorisation. An earlier release approval is not permission for a later release.
7. Synthetic data and isolated environments only in tests; no real cloud sync, Gemini, Google Calendar or real backups in tests.
8. Secret and privacy scan before any authorised push.
9. Manage AI quota: do not repeat finished analyses or passed tests without a relevant change; targeted tests first, the full suite at end points; short reports.
10. Do not ask for micro-approvals on routine technical fixes; do ask for financial decisions, real-data changes, origin migration, merge and deploy.
11. Independent review (a reviewer that did not write the code) for significant packages; ChatGPT acts as independent architect/reviewer.

## 3. Product and UI (as stated by the owner; apply to new work)

1. Persian, right-to-left, Jalali dates, mobile first (Android).
2. Amounts are entered in **million toman**. Summaries show one decimal; details show exact amounts; key totals also show rial, written once as «… تومان معادل … ریال», never rial alone.
3. Open information progressively; avoid long tiring pages.
4. Every document has view, edit, register and print; every summary tile drills down to its record.
5. Lists have filters and reopen with the last filter.
6. Undo only after delete/void-like actions.
7. The phone's Back goes back exactly one nested step.
8. Journal-style, tabular entry forms where possible; text right-aligned, numbers keep their alignment; long text wraps.
9. Smart item picker with filters (in stock, recent, best-selling, last with this person …).
10. Optional smart features are user toggles.
11. Meaningful, consistent colours and icons.
12. Propose new capabilities; build them only after approval. Fix bugs and do the owner's requests directly.

## 4. Scope boundaries

- Single user; no multi-user roles or permissions are to be designed or claimed.
- The app's data must move to a separate web origin (decided; plan and timing need approval — OR-1).
