# Current project state

Update this file whenever branch, commit, version or deployment changes (see [AI_CONTINUATION_GUIDE.md](AI_CONTINUATION_GUIDE.md) §4). Every line states its evidence.

**As of 2026-11-06 (verified with `git ls-remote`, `tools/version.js check` and the GitHub deployments API):**

| Item | Value | Evidence |
|---|---|---|
| Released branch | `main` | GitHub default branch |
| Commit | `5dfabe591b3e9e7e53409059e86dc491ee40f377` (merge of PR #6, 2026-11-04) | `git ls-remote origin main` |
| Version | 4.45 | `node tools/version.js check` → «consistent: 4.45» (APP_VER, the four `*_VER` parts, `sw.js` cache name, `version.json`) |
| Deployment | GitHub Pages deployment `7544359496` for that commit, state `success` | deployments API |
| Live check on a phone | **not verified** (no access to `github.io` from the AI environment; owner to confirm «نسخهٔ ۴٫۴۵») | — |
| Open pull requests | none for the app; the documentation PR that adds this folder | GitHub |
| Last full test run | 2026-11-05 on `5dfabe5`: 429 passed, 3 failed (2 = date-dependent test bug TEST-57, 1 = timeout under load; no app defect) — see [TESTING_AND_QUALITY.md](TESTING_AND_QUALITY.md) | run log |
| Previous full run on the same files | 2026-11-04 on `0582a88` (identical tree): 432 passed, 0 failed | run log |

## Stale branches on GitHub (merged or superseded; safe to delete after a check)

`audit-4.45`, `eng-4.44`, `fix-4.43`, `fix-arap-4.42`, `eng-4.41`, `stage2-final` (all merged), `docs-sync-4.42` (never merged; its content went into 4.43/4.44 docs).

## Open items needing the owner

DEC-1, DEC-2, DEC-3, SITE-1 confirmation, OR-1 timing, PH-1 phone check — see [DECISION_REGISTER.md](DECISION_REGISTER.md) and [ROADMAP.md](ROADMAP.md).
