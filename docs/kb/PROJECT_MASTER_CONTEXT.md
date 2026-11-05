# Reza Desk — project master context (start here)

Reza Desk («میز کار رضا») is a private, single-user, offline-first Persian (RTL, Jalali) progressive web app that runs one person's work and life on an Android phone: people/CRM, tasks and calendar, money (single-entry rows with a derived double-entry ledger), invoices and documents, stock (lots and moves, honey business), clinic cases and visits, apiary, worship, trips, vault and more.

- Repository: `rezaebrahimiasl/miz-kar` (public — code only, never data). Live: https://rezaebrahimiasl.github.io/miz-kar/ (GitHub Pages from `main`).
- Owner: the single user. AI assistants (Claude as implementation engineer, ChatGPT as independent reviewer) work only through this repository and the owner's explicit approvals.
- **Reza Desk and SandooghYar («صندوق‌یار») are entirely independent projects.** Nothing here applies to SandooghYar.

## Knowledge system (this folder)

| Document | Answers |
|---|---|
| [CURRENT_PROJECT_STATE.md](CURRENT_PROJECT_STATE.md) | What is on `main` now: commit, version, deployment, open work |
| [PRODUCT_POLICIES.md](PRODUCT_POLICIES.md) | The owner's standing rules (product, data, engineering, privacy) |
| [FUNCTIONAL_SPECIFICATION.md](FUNCTIONAL_SPECIFICATION.md) | What the app does, domain by domain, and the key workflows end to end |
| [DATA_ARCHITECTURE.md](DATA_ARCHITECTURE.md) | Architecture diagram, module interaction matrix, storage, invariants, integrations, external observer, AI boundary |
| [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) | Architecture decision records (why things are the way they are) |
| [DECISION_REGISTER.md](DECISION_REGISTER.md) | Every product/financial decision: approved, pending, superseded, rejected |
| [USER_INTERACTION_HISTORY.md](USER_INTERACTION_HISTORY.md) | Owner requests, corrections and approvals, chronologically (what is recoverable) |
| [DEVELOPMENT_JOURNAL.md](DEVELOPMENT_JOURNAL.md) | Implementation stages, reviews and test outcomes with commits |
| [TESTING_AND_QUALITY.md](TESTING_AND_QUALITY.md) | How quality is verified, what is not verified, known test issues |
| [ROADMAP.md](ROADMAP.md) | Prioritised next work |
| [CHANGELOG.md](CHANGELOG.md) | Version → date → commit → summary |
| [AI_CONTINUATION_GUIDE.md](AI_CONTINUATION_GUIDE.md) | How a new AI or engineer continues safely, plus the documentation sync checklist |

## Existing documents (kept, authoritative for their scope)

| Document | Scope |
|---|---|
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Code-level architecture: write path, Store, service worker, regions (checked by `tests/05-docs.test.js`) |
| [`../DATA.md`](../DATA.md) | Data dictionary: collections, fields, authoritative sources, chart of accounts (checked by test 05) |
| [`../BACKLOG.md`](../BACKLOG.md) | Done / open / decisions table with IDs (ARAP-3, DEC-2 …) |
| [`../RELEASE.md`](../RELEASE.md) | Release and rollback procedure |
| [`../../HANDOFF.md`](../../HANDOFF.md) | Version-by-version engineering log (Persian until 4.29, English after); the most detailed history |
| [`../../REZA_DESK_DISCOVERY.md`](../../REZA_DESK_DISCOVERY.md) | Read-only discovery audit of v4.21 (historical snapshot) |
| [`../../tests/README.md`](../../tests/README.md) | What each test file covers |

Precedence when documents disagree: the code and Git first; then `docs/ARCHITECTURE.md` / `docs/DATA.md` (machine-checked); then this folder; then `HANDOFF.md` history. Fix the disagreement in the same change that finds it.
