# Current project state

Update this file whenever branch, commit, version or deployment changes (see [AI_CONTINUATION_GUIDE.md](AI_CONTINUATION_GUIDE.md) §4). Every line states its evidence.

**As of 2026-11-06 (verified with `git ls-remote`, `tools/version.js check` and the GitHub deployments API):**

| Item | Value | Evidence |
|---|---|---|
| Released branch | `main` | GitHub default branch |
| Commit | `71d3fb6316b8aea1655de81d77621f8760633d01` (merge of PR #8, 4.46) | `git ls-remote origin main` |
| Version on `main` | 4.46 | `node tools/version.js check` |
| Deployment | GitHub Pages deployment `7592368725` for that commit, state `success` | deployments API |
| In preparation | 4.47 on branch `release-4.47` (decisions page, amani return, CI, calculation tests) — see `HANDOFF.md` | branch |
| Live check on a phone | **not verified** for 4.40–4.46 (PH-1) | — |
| CI | `.github/workflows/tests.yml` (from 4.47): full suite on every pull request and push to `main` | workflow file |
| Last full test run | see [DEVELOPMENT_JOURNAL.md](DEVELOPMENT_JOURNAL.md) (latest row) | run log |

## Stale branches on GitHub (merged or superseded; safe to delete after a check)

`stabilize-4.46`, `docs-knowledge-system`, `audit-4.45`, `eng-4.44`, `fix-4.43`, `fix-arap-4.42`, `eng-4.41`, `stage2-final` (all merged), `docs-sync-4.42` (never merged; its content went into 4.43/4.44 docs).

## Open items needing the owner

DEC-1, DEC-2, DEC-3 (answer in the app: «تصمیم‌های حسابداری», from 4.47), AUD-1…AUD-8 (independent accountant findings, `docs/BACKLOG.md`), SITE-1 confirmation, OR-1 (plan, timing and execution approvals), PH-1 phone check — see [DECISION_REGISTER.md](DECISION_REGISTER.md) and [ROADMAP.md](ROADMAP.md).
