> **Out of date (written for v4.20).** Current architecture, data model, release process and backlog: `docs/`. Kept only as a historical record.

# Reza Desk (میز کار رضا): Discovery Report

- **Date:** 2026-10-27
- **Inspected revision:** `main` @ `0683e47`, app version 4.20
- **Scope:** read-only discovery. No application file was changed, and nothing was installed, refactored or migrated. This report is the only file added.

**Confidence labels used in this report**

| Label | Meaning |
|---|---|
| **[V]** Verified | Checked directly in the repository files, git history, or by measurement in a headless browser. |
| **[I]** Inference | Reasoned from the evidence but not proven. |
| **[U]** Unknown | Could not be determined from what is available. |

---

## Executive summary

- **What it is.** Reza Desk is a single-user, offline-first Persian PWA (Jalali calendar, right-to-left layout).
  - It is built as one ~1.45 MB `index.html` file.
  - The file holds ~5,860 very long lines, and ~1.24 MB of that is one inline `<script>`.
  - There is no framework, no build step and no package manifest.
- **Where data lives.** All data stays on the phone in IndexedDB. The repository contains code only.
- **Optional external services:**
  - Encrypted backup and multi-device sync through the user's own private GitHub repository.
  - Google Calendar mirroring.
  - Gemini AI, with clinical text de-identified first.
- **Breadth.** The app covers about 25 functional areas over 29 data collections:
  - tasks and calendar
  - people/CRM
  - double-entry accounting
  - invoices and documents
  - inventory and kardex
  - apiary (beekeeping)
  - clinic records
  - Quranic research
  - worship tracking
  - assets
  - an encrypted vault
  - and more
- **History.** It went from version 0.5 to 4.20 in 17 days, across 169 commits and 135 release-note groups.
- **Main structural risk.** One very large file with one central 198 KB action `switch` and one global state object `S`.
  - Everything is coupled to everything else.
  - **[V]** There is already one unreachable duplicate `case` label: `docRestore` (details in §7).
  - The automated tests that exist were **not in the repository**. They lived in an ephemeral working folder.

---

## 1. Project overview

| Item | Finding |
|---|---|
| Purpose | **[V]** A personal "chief-of-staff" desk for one person: tasks and planning, people, money and accounting, honey trading and inventory, beekeeping, holistic-medicine clinic records, research, spiritual practice, assets and a password vault (`README.md`; `MODS` at `index.html` ~L1847; `DOMS` ~L3420). |
| Users | **[V]** One owner (Persian, Android, mobile-first). An "editions & activation" licensing system exists (`index.html` ~L1849, ECDSA P-256 signed licences), so other users are possible. **[I]** It is used by the owner only today. |
| Objectives | **[V]** Release notes (`WHATS_NEW`, ~L2357) and `HANDOFF.md` describe the goals: one coherent app instead of many tools; local-first privacy; drill-down from every figure to its record; full edit history; journal-style accounting. |
| Status | **[V]** Active, fast iteration: 169 commits from 2026-10-10 to 2026-10-27, peaking at 40 commits on 2026-10-20 (`git log`). The current version is 4.20. **[I]** It is production use by the owner rather than a finished product: features are still added weekly, and the last few versions restructured navigation (planets home and "مالی" merge in v4.16–4.19). |

## 2. Technology stack (verified only)

| Layer | Finding | Evidence |
|---|---|---|
| Language | HTML, CSS and plain JavaScript (ES2020+: async/await, optional catch binding, template literals) | `index.html` |
| Framework / libraries | **None.** UI is built as template strings set with `innerHTML` (130 occurrences), using a hand-written router and render loop. `qr.js` (29 KB) is the only separate library: a QR code generator. | `index.html`, `qr.js` |
| Build tooling | **None.** There is no `package.json`, bundler, transpiler, linter or minifier. The file is served exactly as written. | repo root listing |
| Storage | IndexedDB `miz-kar` holds one object store `docs` with key `col/id`, which contains every collection. A second database, `miz-kar-snap`, holds local snapshots. About 47 `localStorage` keys (`miz.*`) hold settings, drafts, trash, usage stats and tokens. A few `sessionStorage` keys hold session state, including the Google OAuth token. | `initDb()` ~L401, `snapOpen()` ~L536 |
| Alternative storage | A dormant "cloud" mode uses `window.claude.use('db')` when the app runs inside a Claude artifact. It is still referenced in 8 places. | ~L401–405 |
| Offline / PWA | Service worker `sw.js` serves the cached app shell first and refreshes it in the background, with versioned caches. `manifest.webmanifest` declares a share target. `version.json` is polled to detect updates. | `sw.js`, `manifest.webmanifest`, ~L3825 |
| Hosting | **[I]** GitHub Pages from the public repository `rezaebrahimiasl/miz-kar`, branch `main`. The relative `version.json` fetch and the repo layout fit this. The Pages configuration itself was not inspected. **[U]** Custom domain. | `git remote` |
| External APIs | Allowed by the Content Security Policy: `api.github.com` and `gist.githubusercontent.com` (backup, sync, `.ics` feed), `generativelanguage.googleapis.com` (Gemini) and `www.googleapis.com` (Google Calendar). There is no backend of its own. | CSP `<meta>` in `<head>` |
| Crypto | WebCrypto: PBKDF2 → AES-GCM for backups (150k iterations) and the vault; ECDSA P-256 for licence verification. | ~L1332, L1867, L1884, L2743 |
| Testing | Playwright with Chromium, run ad hoc. The scripts are **not** in the repository (see §8). | session working folder |

## 3. Application structure

```
miz-kar/                          (public GitHub repo, code only)
├── index.html          1,446,194 B   the whole application: HTML shell (~3 KB), CSS (~32 KB), one JS block (~1.24 MB)
├── sw.js                   3,113 B   service worker (cache name = version)
├── version.json               14 B   {"v":"4.20"}: update probe
├── manifest.webmanifest      856 B   PWA manifest, share target
├── qr.js                  29,507 B   QR generator (device pairing)
├── logo.webp, icon*.png              brand assets
├── HANDOFF.md             90,555 B   engineering notes per version (Persian)
└── README.md                 380 B   one-paragraph description
```

**Architecture [V]**

- **Global state.** `const S={people:[],deals:[],…}` (~L388) is the in-memory database: 29 arrays. `COLS=Object.keys(S)`.
- **Write path.** `save(col,id,data)` → `putRaw` → `idbPut`. Also `delDoc` and `markDirty()`, which bumps the data version `window._dv`. `dataSig()` memoises derived computations: `remMap`, `personBal`, `autoEntries`.
- **Render.** `render()` (~L3490) chooses the view from `tab`: `vHome`, `vDom`, `vToday`, `vTasks`, `vPeople`, `vMoney`. It rebuilds `#view.innerHTML` on every change.
- **Sheets.** About 183 `openSheet(...)` call sites create modal pages. Navigation between them uses a stack (`SST`, `sheetBack`, `closeSheet`) tied to `history.pushState` so the phone's back button goes exactly one step.
- **Events.** About 80 `addEventListener` calls. One delegated click handler dispatches `data-act` values through **one `switch(a)`** (~L4881) with **579 `case` labels**; this "Actions" section alone is about 198 KB. Form submit is a second large delegated handler keyed on `data-form`.
- **Size.** 709 named functions and 478 arrow-function constants, all in one global scope. No modules, no imports.

**Largest code regions, measured by section marker comments [V]**

| Region | Size |
|---|---|
| Actions switch | 198 KB |
| Vault | 70 KB |
| Letters, contracts and invoices | 63 KB |
| Drafts | 56 KB |
| What's-new catalogue | 55 KB |
| Accounting | 34 KB |
| Google Calendar | 30 KB |
| Data safety | 30 KB |
| Inventory | 25 KB |
| Kardex | 24 KB |

## 4. Module inventory

**Toggleable modules.** `MODS` (~L1847) are switched by `on(k)` = profile setting + licence: cheques, docs, deals, stock, acc, recurs, apiary, clinic, quran, ibadat, trips, habits, wins, vault.

**Status key:** ● = implemented and in daily use (per release notes and code); ◐ = implemented but thin or partly overlapping; ? = not verified in depth.

| Module | Purpose and main features | Main code (approximate line) | Status |
|---|---|---|---|
| Home "منظومه" (planets) | Animated launcher of domains, themes, tap effects | `vHome`, `spaceRun`, `domGo` ~L3420–3460 | ● (v4.16–4.19) |
| Domain pages | Per-domain KPIs, tools, recent items, hideable sections | `vDom`, `domKpis`, `DOMT` ~L3460–3490 | ● new |
| Today | Agenda, prayers, check-ins, suggestions, drafts card | `vToday` | ● |
| Tasks and calendar | Tasks, repeats, pause, time-blocks, task book, weekly review | `vTasks`, `taskSel`, `tbookSheet` | ● |
| Google Calendar | Two-way mirror with per-item or bulk approval (OAuth implicit flow) | ~L1353 (30 KB) | ● |
| ICS feed | Calendar as `.ics` in a secret gist | `calFeed` ~L1338 | ◐ overlaps with Google Calendar |
| People / CRM | People, contacts import, smart person picker, balances | `vPeople`, `personSelect`, `ppSearch` ~L3556 | ● |
| Deals | Sales opportunities pipeline | `vDeals` | ● (now a "مالی" sub-tab) |
| Money and ledger | Single-entry ledger rows (paid, received, receivable, payable), accounts, aging, forecast | `vMoney`, `ledgerRow`, `formLedger` | ● |
| Double-entry accounting | Chart of accounts, auto-vouchers from all records, journal-style voucher, GL, trial balance, P&L, period lock | ~L4410, ~L4796 | ● |
| Recurring payments | Instalments, salaries, partial confirmation | `recurs` | ● |
| Cheques | Received and issued cheques with due dates | `cheques` | ● |
| Documents and invoices | Sale, purchase, returns, gift, proforma, contract, letter; print/PDF; versioned edits | `formDoc` ~L2133, ~L2020 (63 KB) | ● |
| Inventory and trade | Lots, moves, packaging, units, item picker, kardex | ~L4012, ~L4120 | ● |
| Marketers and commissions | Commission suggestions and settlement | ~L2570 | ? |
| Apiary | Log (move, harvest, census, treatment…), production | ~L3838, `APT` | ● |
| Clinic | Cases, visits, protocols, progress, follow-up, history import, de-identified AI | ~L819–1353 | ● |
| Quran research | Topics, verses, keywords | `qtopics`, `qverses` | ◐ |
| Worship (عبادات) | Prayers, fasting, صله‌رحم, charity | `ibadat`, `PRK` | ● |
| Habits and check-ins | Daily check-in | `habits`, `checkins` | ◐ |
| Wins and periodic report | Insights, weekly and monthly report | `wins`, `periodReport` | ● |
| Trips | Trips with costs and destination tasks | `trips` | ◐ |
| Meetings | Weekly sessions plus group SMS reminder | `meets` | ● |
| Campaigns | **[U]** Purpose not verified | `campaigns` | ? |
| Assets registry | Property, cars, bills, expiries | ~L2721 | ● |
| Vault | Encrypted passwords, codes, documents | ~L3129 (70 KB) | ● |
| قرض‌الحسنه | Display-only domain; **[V]** reads the separate SandooghYar app's IndexedDB (`indexedDB.open('sandooghyar')` ~L2830); does not post to Reza Desk accounts | `DOMS` qard | ◐ |
| AI assistant | Gemini with the user's key (stored on the phone) | `aiHub` | ● |
| Drafts (Keep-style) | Every open form autosaved locally | ~L3529 | ● |
| Backup, sync, recovery | GitHub encrypted backup, multi-device sync (QR pairing), local snapshots, recovery mode, trash, emergency PDF | ~L523, ~L1328 | ● |
| Licensing and editions | Signed licences, owner and admin key generation | ~L1849 | ● |

## 5. Data and database

**Persistence [V]**

- **Database layout.** One IndexedDB store holds every record as `{k:'col/id', col, doc}`. The whole database is loaded into memory (`S`) at start-up, and all queries are `Array.filter/find` scans in memory. `byId` (~L389) is a linear `find`.
- **No schema enforcement.** Records are free-form objects with `id`, `created` and `updated`, and usually `void` (a soft delete, also used for edit history).
- **Edit history.** Done through `redoOf` chains on docs, `hist` arrays, the "trash" in `localStorage` (`miz.trash`) and daily snapshots in `miz-kar-snap`.

**The 29 collections [V].** Their relationships, inferred from field names in the code:

| Collection | Main links |
|---|---|
| `people` | central; referenced by `personId` in ledger, docs, moves, tasks, cases, cheques, quotes, deals, voucher lines |
| `contacts` | phone contacts imported; separate from `people` (possible duplication of persons) |
| `ledger` | `personId`, `docId`, `lotId`, `refId` (settlement), `visitOf` (clinic fee), `netOf` |
| `vouchers` | `lines[]` of `{acc, dr, cr, personId, bank, refId}` |
| `docs` | `personId`, `items[]` with `lotId`, `redoOf`, `dealId`, `viaSale` |
| `lots` | `supplierId`, `docId`, `packId`, `parentId` |
| `moves` | `lotId`, `personId`, `docId` |
| `quotes` | `personId`, product and variety |
| `deals` | `personId` |
| `tasks` | `personId`, `dealId`, `caseId` (appointments), `meetId` |
| `cases` | case header; visits link to it by `caseId` |
| `visits` | `caseId` |
| `apiary` | event type (`APT`) |
| `cheques`, `recurs`, `trips`, `campaigns`, `meets`, `assets`, `vault`, `habits`, `checkins`, `ibadat`, `wins`, `notes`, `inbox`, `qtopics`, `qverses` | mostly self-contained, with optional `personId` |
| `meta` | settings records: profile, chart-of-accounts overrides, accounts, census and others |

**Shared and duplicated money data [V]**

- Money appears in three forms:
  - `ledger` rows (single-entry)
  - `vouchers` (double-entry)
  - side effects of posting `docs`, which create ledger rows, lots and moves through `postDoc` (~L1988)
- `autoEntries()` turns all three into one journal at read time.
- **[I]** This is the main source of complexity and of the earlier balance bugs (fixed in v4.13–4.15).

**Other overlaps [V]**

- Persons exist both as `people` and as `contacts`.
- Clinic appointments are stored as `tasks` with a `caseId`.
- The calendar exists in two forms: the `.ics` gist and the Google Calendar API.

## 6. Module integration

- **Shared core [V]:** `S`, `save`, `render`, `openSheet`, `personSelect`, the date helpers (`today`, `jShort`, `addDays`), `money()` formatting, `fBar` filters, `itemPicker` and `autoEntries`. Every module depends on these globals.
- **Heavily integrated [V]:**
  - documents ↔ inventory (lots and moves) ↔ ledger ↔ accounting ↔ people balances
  - clinic ↔ ledger (visit fees) ↔ tasks (appointments) ↔ AI
  - tasks ↔ Google Calendar ↔ Today
- **Mostly isolated [V]:** vault, Quran research, worship (except Today cards), habits, trips, assets (except expiry reminders), قرض‌الحسنه (read-only bridge to the SandooghYar app's database).
- **Key workflow [V]: sale invoice** (traced and tested in this session):
  1. `formDoc` opens the invoice.
  2. Each row is chosen in `itemPicker`, or bought on the spot with `buyNow`.
  3. Submit calls `postDoc`, which writes the doc, the moves and the ledger rows.
  4. `markDirty` invalidates the memoised results.
  5. `autoEntries` and the balances are recomputed on the next render.
  6. Optionally the event is mirrored to Google Calendar, and the GitHub backup is marked dirty.
- **Overlaps [V]:**
  - Money entry can start from at least four places: `formLedger`, `formLedgerV` (old rows opened as a voucher), `formVoucher` and `payVoucher`.
  - Stock changes go through `formMove` (5 uses) as well as documents.
  - Calendar export exists twice (see §5).

## 7. Technical complexity and maintainability (with evidence)

| # | Finding | Evidence | Label |
|---|---|---|---|
| 1 | Monolithic file: all UI, logic, CSS and data access in one 1.45 MB file, with an average line length of ~250 characters | `index.html` | V |
| 2 | One 579-case `switch` (198 KB) as the action dispatcher, so every feature edits the same region | `switch(a){` ~L4881 | V |
| 3 | **Unreachable duplicate case `docRestore`.** The first case (~L4918) restores a *voided* document. The second (~L5094, added in v4.15 for "restore an earlier version") can never run. The version-restore button (~L2211) therefore triggers the first behaviour instead. | `grep "case'docRestore'"` | V; the user-visible effect is **[I]** and was not tested |
| 4 | Dead code: functions defined but never referenced: `vBiz` (navigation merge in v4.16), `myAcctsOld`, `restoreJsonOld`, `fHint` | static reference scan | V |
| 5 | Near-identical names invite mistakes: `catSync` (ledger category select) and `catsSync` (profile categories) | ~L382 and the `catsSync` definition | V |
| 6 | Legacy paths kept alive: tab names `biz`, `deals`, `stock` remapped in `render()`; old "direct purchase" row source `buy` with `buyGuard`; `legacy` flags (18 references); cloud mode (8) | `render()`, `buyGuard` ~L4780 | V |
| 7 | Global mutable state (`window._buyRet`, `_ipNew`, `_subAt`, `_ignPop`, `_ignTab`, `_opener`…) passes context between sheets; this is fragile with the back-button stack | `sheetBack` ~L3514 | V |
| 8 | Error swallowing: 342 `try{` blocks, 209 empty `catch(_){}`. Failures are silent by design, which makes bugs hard to see. | count | V |
| 9 | Full re-render via `innerHTML` on every change, with no virtual DOM or keyed diff. Fast today (see §8), but cost grows with data. | `render()` | V / I |
| 10 | In-memory linear scans (`S.x.filter`, `find`) everywhere. **[I]** Fine at today's volume; could matter with years of data (thousands of records). | `byId` | V / I |
| 11 | No circular *module* dependencies (there are no modules), but logical cycles exist: docs → ledger → accounting → doc views. | — | I |
| 12 | Release notes (`WHATS_NEW`, 55 KB, 135 groups) are shipped inside the app bundle, and the file grows with every version | ~L2357 | V |

## 8. Performance and development workflow

**What happens on an update request [V], as observed in this and earlier sessions:**

1. `git pull` on the working copy.
2. Find the relevant code. The file is too large to read whole, so this means many `grep` and partial reads.
3. Edit the code with exact-match string-replacement scripts.
4. Syntax-check the extracted script with `node --check`.
5. Run one or more Playwright scripts against a local static server and look at screenshots.
6. Bump the version in five places: `APP_VER` and `WHATS_NEW` in `index.html`, the cache name in `sw.js`, `version.json` and `HANDOFF.md`.
7. Commit and push. The phone picks up the update through `version.json` and the service worker.

**Measured facts (this session, cloud container)**

| Step | Time |
|---|---|
| `git pull` | 0.96 s |
| Extract script + `node --check` | 0.21 s |
| One Playwright scenario script, including browser start and a fixed 3 s settle wait | 23.5–25.9 s (3 scripts measured) |
| Earlier multi-flow script (`s18`) | **> 120 s** (exceeded the foreground timeout) |
| App load to first render (headless Chromium, local server) | ~0.41 s |
| `render()` per call with seeded data (32 records) | home 0.9 ms, today 1.6 ms, tasks 0.4 ms, people 0.7 ms, money 2.0 ms |

In this session, typical updates ran 2–6 scenario scripts plus 1–3 fix-and-retest loops (e.g. v4.16: 3 loops; v4.20: 4 loops).

**Hypotheses for "10+ minutes per update" [I]**

1. **Finding code is the main cost.** With 1.45 MB in one file, every change starts with searching for the right functions, CSS and action cases. Context about the file is lost whenever a long conversation is compacted, so the search repeats.
2. **Verification loops.** Each Playwright run costs ~25 s, and real fixes usually need several runs plus screenshot review. Fixed waits (`waitForTimeout`) inflate this.
3. **Test scripts are not versioned.** They live in an ephemeral working folder, so each new session partly rebuilds or rediscovers them.
4. **Release overhead.** Each update touches five places, including long Persian release-note text.
5. **The app itself is not the bottleneck.** Load and render are measured in milliseconds.

**Unknowns [U]**

- Real-device performance with the owner's actual data volume.
- GitHub Pages propagation delay.
- Service-worker update latency on the phone.

## 9. Security and data protection

- **Authentication [V]:** none inside the app. There is no PIN or app lock (no lock code found), so the app relies on the phone's own lock.
  - The vault has its own password: AES-GCM with a PBKDF2-derived key (`secEnc`/`secDec` ~L2743).
  - Amounts can be blurred on screen (`html.vhide`).
- **Permissions [V]:** single user. Licence editions gate modules (`licOK`). There are no roles.
- **Patient data [V]:**
  - **Where it is stored:** clinic cases and visits stay on the device in IndexedDB.
  - **AI calls:** text is passed through `deid()` (~L957) before being sent to Gemini.
  - **Calendar:** clinic items go to Google Calendar only when `calClinic` is switched on; it is off by default (`SM_DEFOFF`).
  - **[I] Plaintext copies on the device:**
    - The local snapshots (`miz-kar-snap`) are not encrypted.
    - The drafts (`miz.drafts`) and trash (`miz.trash`) are plain JSON in `localStorage`, and they can hold clinical text.
- **Backups [V]:**
  - Backups go to the user's **private** GitHub repository through a token stored in `localStorage` (`miz.gh`).
  - Encryption is **optional**: if no passphrase is set, the backup is uploaded as plain JSON (`ghPack` ~L1332).
  - The calendar `.ics` feed uses a *secret* gist, which is unlisted but readable by anyone who has the URL.
  - Local file export and an emergency PDF also exist.
- **Recovery [V]:** a load-integrity check, `recoverySheet` for unreadable records, a shrink guard, daily snapshots and `navigator.storage.persist()`.
- **Code and secrets [V]:**
  - The repository is public and contains no data.
  - The GitHub token, Gemini key and Google OAuth token are kept only in browser storage on the phone (`LS_SKIP` excludes them from backups).
  - The licensing private key is generated on the phone, wrapped with AES-GCM (~L1884) and never written to the repository.
- **Content Security Policy [V]:** present, but it allows `'unsafe-inline'` scripts. That is unavoidable with one inline script, and it means any HTML-injection bug would reach the tokens stored in `localStorage`. **[I]** The risk is mitigated by consistent use of `esc()` in templates; this was not audited exhaustively.
- **[U]** Whether the backup passphrase is actually set on the owner's phone.

## 10. Strengths and weaknesses

**Strengths [V]**

- Truly local-first and works offline.
- No backend to run or pay for, and zero build step: deployment is a `git push`.
- Strong data-safety layer: snapshots, recovery mode, trash, soft-delete, version chains.
- One unified accounting model (`autoEntries`) behind all money features.
- Consistent mobile and right-to-left UX conventions, and a back-button stack that goes one step at a time.
- Thorough per-version engineering notes (`HANDOFF.md`).
- Privacy features: de-identification before AI, the vault, optional backup encryption.

**Weaknesses [V/I]**

- Single 1.45 MB file with one 579-case dispatcher. Every change has a large "blast radius", and each change is slow to locate and verify.
- No versioned automated tests or CI, so regressions are caught by hand or by ad hoc scripts.
- Overlapping data paths: ledger, vouchers and posted docs; people and contacts; two calendar exports.
- Legacy and dead code accumulates (§7 items 3–6).
- Silent error handling.
- Sensitive data in plaintext browser storage (drafts, trash, snapshots), and backup encryption is optional.

**Uncertain [U]**

- Behaviour with several years of data.
- How completely Campaigns, Marketers and Trips are implemented.
- Real-device update latency.

## 11. Documentation

- **Existing [V]:**
  - `README.md`: one paragraph.
  - `HANDOFF.md`: 90 KB in Persian. One section per version, listing key functions and decisions; a chronological changelog.
  - In-app guide and release notes (`WHATS_NEW`, help sheets).
  - Inline section comments (92 markers).
- **Most useful additions [I]:**
  1. An architecture map: regions of `index.html`, the core globals, and the render, action and submit flow.
  2. A data dictionary for the 29 collections: fields, links, which module writes each field.
  3. A money-flow document: how ledger, vouchers and docs become the general ledger, with the account codes.
  4. A test catalogue: scenarios with expected results, kept in the repository.
  5. A security and data-handling note: what is stored where, what leaves the device, and the backup/restore procedure.
  6. A current-state `HANDOFF` summary, separate from the per-version log.

## 12. Five areas to investigate next (no refactoring plan yet)

1. **Test suite in the repository.** Bring the existing Playwright scenarios (seed data, invoices, accounting comparison, planets, kardex) into the repo, with fast waits. This shortens every future update and protects against regressions.
2. **Dead and duplicate code audit.** Start with the unreachable `docRestore` case (a likely live bug), the dead functions, and the legacy `biz`/`buy`/cloud paths.
3. **How to split `index.html` with no build step.** Investigate whether separate `<script>` files, served by the service worker, would cut search and edit time without adding tooling.
4. **Money data model consolidation study.** Map exactly where ledger rows, vouchers and doc postings overlap, before any change.
5. **Sensitive-data-at-rest review.** Look at drafts, trash and snapshots holding clinical text; whether backup encryption should be mandatory; and token exposure under `'unsafe-inline'`.

## Inspection limitations

- **Static and partial reading.** The analysis used text search and targeted reads; the 1.24 MB script was not read line by line. Module status is inferred from code paths and release notes, not from exhaustive testing.
- **Environment.** Measurements come from a cloud container with headless Chromium and a tiny seeded dataset, not from the owner's phone or real data. No real user data was accessed.
- **Hosting.** The GitHub Pages settings, the private backup repository and Google Cloud console settings were not inspected.
- **Not tested.** The `docRestore` issue was found statically; its user-visible effect was not tested.
