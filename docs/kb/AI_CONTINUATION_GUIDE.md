# Continuation guide for a new AI assistant or engineer

You can continue Reza Desk without any earlier conversation. Read in this order: [PROJECT_MASTER_CONTEXT.md](PROJECT_MASTER_CONTEXT.md) → [CURRENT_PROJECT_STATE.md](CURRENT_PROJECT_STATE.md) → [PRODUCT_POLICIES.md](PRODUCT_POLICIES.md) → [DATA_ARCHITECTURE.md](DATA_ARCHITECTURE.md) → [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and [`../DATA.md`](../DATA.md) → [ROADMAP.md](ROADMAP.md).

## 1. Ground rules (summary of [PRODUCT_POLICIES.md](PRODUCT_POLICIES.md))

- Never touch real data; never commit, push, merge or deploy without the owner's fresh explicit approval; never decide accounting meaning.
- Synthetic data only; no real cloud, Gemini or calendar calls in tests.
- Small reversible changes, a regression test that fails on the base commit, independent review for significant work, full suite before release.
- Reza Desk and SandooghYar are separate projects.
- Reply to the owner in Persian; amounts in million toman.

## 2. Set-up

```sh
git clone https://github.com/rezaebrahimiasl/miz-kar && cd miz-kar
npm i -g playwright && npx playwright install chromium   # development only
python3 -m http.server 8080                              # open http://localhost:8080
sh tests/run.sh                                          # full suite
```

## 3. Working with the code

- `node tools/q.js map` (regions), `fn <name>`, `act <name>`, `form <name>`, `writers <col>`, `callers <name>`, `tests <name>`.
- All writes: `save` / `putRaw` / `delRaw`; multi-record: `Store.batch(key, async B => …)` passing `B` to every write; read committed state for exports with `Store.read`.
- A new part `js/<x>.js` must be registered in `APP_PARTS`, a `<script>` tag, the start-up guard and `sw.js` `PARTS`/`SHELL` (test 00).
- Version: `node tools/version.js set X.Y`, then add a `WHATS_NEW` group (Persian) and a `## vX.Y` section in `HANDOFF.md`.
- Release and rollback: [`../RELEASE.md`](../RELEASE.md). Rollback = a new commit restoring the previous files with a higher version; never history rewrites.

## 4. Documentation synchronisation checklist (after every meaningful change)

| Change | Update |
|---|---|
| Owner requirement or correction | [PRODUCT_POLICIES.md](PRODUCT_POLICIES.md) (if it is a standing rule) and [USER_INTERACTION_HISTORY.md](USER_INTERACTION_HISTORY.md) |
| Architecture decision | [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) (new ADR) and [DECISION_REGISTER.md](DECISION_REGISTER.md) |
| Product / financial decision | [DECISION_REGISTER.md](DECISION_REGISTER.md) |
| Code or test work | [DEVELOPMENT_JOURNAL.md](DEVELOPMENT_JOURNAL.md), [TESTING_AND_QUALITY.md](TESTING_AND_QUALITY.md) if test practice changed, `HANDOFF.md` version section, `tests/README.md` for new tests, `docs/ARCHITECTURE.md` / `docs/DATA.md` if structure or fields changed (test 05 checks them) |
| Priorities | [ROADMAP.md](ROADMAP.md) and `docs/BACKLOG.md` |
| Branch, commit, version, deployment | [CURRENT_PROJECT_STATE.md](CURRENT_PROJECT_STATE.md) |
| Release | [CHANGELOG.md](CHANGELOG.md) |
| Always | check [PROJECT_MASTER_CONTEXT.md](PROJECT_MASTER_CONTEXT.md) links and this guide still hold |

Rules: dated, append-only history; never silently overwrite an approved decision (supersede it); no trivial conversation logs; no duplication — link instead; no real names, amounts, clinical text, keys or tokens in any document.

## 5. Before any authorised push

1. `git diff` reviewed; only intended files.
2. Secret scan (`git diff | grep -E "AIza|ghp_|github_pat_|sk-|BEGIN|[0-9]{16}"`) and personal-data check.
3. Tests as in [TESTING_AND_QUALITY.md](TESTING_AND_QUALITY.md) quality gates.

## 6. Real-phone checklist (owner)

1. Before updating: take a full file backup and keep it off the phone.
2. Online: open the app; the line under the title shows the new version (close and reopen once if not).
3. «مالی ← طلب و بدهی» and «پیش‌دریافت، اضافه‌پرداخت و اختلاف»; «تنظیمات ← عیب‌یابی داده‌ها» — tap findings; Back returns to the list.
4. «نمایه و تنظیمات ← همگام‌سازی» with the shop site: either a count of items or an error message.
5. Airplane mode: close and reopen; the app opens with data; add a note; reconnect.
6. Any mismatch: stop, screenshot, take a backup, report. Rollback is a new commit; no data rollback needed.
