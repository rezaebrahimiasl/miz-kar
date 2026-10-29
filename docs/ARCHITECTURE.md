# Reza Desk (میز کار رضا): Architecture

This document describes app v4.29.
Line numbers drift with every change, so code is referred to by **function name**.
`tests/05-docs.test.js` checks that every name written as `name()` here still exists.
Statements marked **[unverified]** were not confirmed against the code.

## 1. What the app is

- **What it is:** a single-user, offline-first, right-to-left Persian Progressive Web App (PWA) for Android.
- **Where data lives:** all data stays in the browser on the phone (IndexedDB).
- **What the repository holds:** code only. GitHub Pages serves the repository root. `checkUpdate()` only runs when the host name ends in `github.io`.
- **Tooling:** no framework, no build step, no package manifest. The files are served exactly as committed.

| File | Role |
|---|---|
| `index.html` | the whole app: HTML shell, CSS, and one inline `<script>` holding all logic |
| `sw.js` | service worker: offline cache and update path |
| `version.json` | `{"v": "<version>"}`, read by `checkUpdate()` |
| `manifest.webmanifest` | install metadata, including the share target (`./share-target`) |
| `qr.js` | QR code generator, used for device pairing |
| `logo.webp`, `icon2-*.png` | brand images (`icon-192.png` and `icon-512.png` are not referenced by the app) |
| `tests/` | developer test suite (see `tests/README.md`); never loaded by the app |
| `docs/` | these documents |
| `HANDOFF.md` | per-version engineering log |

## 2. Offline-first rules (non-negotiable)

1. After the first online visit the app must launch and work with no network. This is covered by `tests/60-offline.test.js`.
2. Core records never need a network service. This covers documents, stock, accounting, people, tasks, clinic, research and worship.
3. The network is used **only** by optional integrations, each switched on by the user:
   - GitHub backup and sync
   - the legacy calendar feed (an `.ics` file in a secret gist)
   - Google Calendar
   - Gemini AI
   - the shop-website catalogue
   - the update check
   - the Google web font

   If any of them fails, core work is unaffected.
4. Cloud backup and sync are sent **only encrypted**. Without a passphrase nothing is uploaded (v4.21; `tests/70-backup-security.test.js`).

## 3. Runtime structure

### 3.1 State and persistence

| Concept | Implementation |
|---|---|
| In-memory database | `const S={people:[],…}`: 29 arrays, one per collection (`COLS=Object.keys(S)`). See `docs/DATA.md`. |
| Storage | IndexedDB database `miz-kar`, one object store `docs`, records `{k:'<collection>/<id>', col, doc}`, written by `idbPut()`. At start `initDb()` loads everything into `S`. |
| Write path | `save()` (closed-period and date-lock checks; record history is kept by the individual forms) → `putRaw()` → `idbPut()`; deletion via `delDoc()`. Every write calls `markDirty()`, which bumps `window._dv` (the data version). |
| Derived data | `dataSig()` hashes the data once per tick. `autoEntries()`, `personBal()` and `remMap()` are memoised on it. |
| Local snapshots | separate IndexedDB `miz-kar-snap`, store `snaps`; `snapTake()` keeps the last 10 full copies (daily, and before restore, sync and delete) |
| Settings | `localStorage` keys prefixed `miz.`; filter and UI memory in `miz.uiF` (`uiKeep()`) |
| Alternative mode | when running inside a Claude artifact (`window.claude.use('db')`), the cloud collection API replaces IndexedDB (`initDb()`) |

### 3.2 User interface

| Concept | Implementation |
|---|---|
| Views | `render()` rebuilds `#view` from the current `tab`: `vHome()` (planets), `vDom()` (domain page), `vToday()`, `vTasks()`, `vPeople()`, `vMoney()` |
| Navigation | `goTab()` with `history.pushState`; the phone back button goes one step |
| Sheets (pages over the view) | `openSheet()` pushes onto a stack (`SST`); `sheetBack()` and `closeSheet()` pop it |
| Actions | one delegated click handler with one `switch(a)` over `data-act` values (about 580 cases). `tests/00-static.test.js` enforces that every action name is unique; `tests/01-wiring.test.js` that every `data-act` and `data-form` has a handler. Click actions that write money or stock outside documents live in the region «Stock & money actions» as named functions (`actLotVoid()` … `actAcctFix()`); their cases only delegate. Submit branches that settle debts and clear cheques live in «Money forms» (`formSettle()`, `formSettleAll()`, `formChqClear()`, `formChqEndorse()`, sharing `ledSettleIfPaid()`). Saving a document, a stock lot, a referral sale or a net-profit entry is done by `formDocSave()`, `formLotSave()`, `formRefSale()` and `formNetSave()`; the submit handler only dispatches to them. To find code without reading the whole file: `node tools/q.js` (see `tests/README.md`). |
| Forms | one delegated submit handler keyed on `data-form` |
| Modules on and off | `MODS` plus `on()` (profile setting combined with edition licence, `licOK()`) |

### 3.3 Business logic that crosses modules

- **Documents.** `formDoc()` edits, and `postDoc()` posts a document into lots, stock moves and ledger rows. `docVoid()` voids or restores a document together with everything `docLinked()` finds. Editing a posted document voids the old version and posts a new one linked by `redoOf`. `viewDoc()` lists the versions.
- **Accounting.** `autoEntries()` derives the double-entry journal from ledger rows, stock moves, lots and vouchers at read time. `balancesByAcc()` and `glBal()` aggregate it. Manual vouchers come from `formVoucher()` and `payVoucher()`. The chart of accounts is described in `docs/DATA.md` §3.
- **Stock.** `lotStat()` gives the remaining quantity of a lot from `lotMoves()`. `invDiag()` compares stock value with the inventory account.

### 3.4 Optional integrations

| Integration | Entry points | Credentials | Notes |
|---|---|---|---|
| GitHub backup | `ghPush()` → `ghPush0()`; payload `backupData()` packed by `ghPack()` | access token and backup passphrase kept in the phone's browser storage only; excluded from backups; never in the repository | refuses to upload without a passphrase |
| Multi-device sync | `ghSync()`, `syncMerge()` | same | requires a passphrase |
| Restore | `doRestore()` (file), `restoreJson()` → preview → `restoreApply()`; decrypt with `ghUnpack()` | — | additive; snapshot taken first |
| Calendar feed (legacy) | `calFeed()`, `calPush()` | same as GitHub backup | only when the user enables it; events about clinic clients get generic titles (`calPatients()`, `calScrubber()`) |
| Google Calendar | `gcItems()`, `gcSync()` | sign-in token kept for the current browser session only (the non-secret OAuth client ID is an ordinary setting and is included in backups) | per-item or bulk approval |
| Gemini AI | `aiCall()`; clinical text passes through `deid()` | the user's own key, kept in the phone's browser storage only; excluded from backups | only with the user's key |
| Update check | `checkUpdate()`, `stashLatest()`, `doUpdate()` | — | updates only to a **higher** version |

### 3.5 Service worker (`sw.js`)

| Aspect | Behaviour |
|---|---|
| Cache names | `miz-kar-v<version>` (the versioned app shell), `miz-shell` (last-resort copy of `index.html`), `miz-share` (incoming shares) |
| Pre-cached files (`SHELL`) | `./`, `index.html`, `manifest.webmanifest`, `icon2-192.png`, `icon2-512.png`, `icon2-maskable-512.png`, `logo.webp`, `qr.js` |
| Install | `fetchAll()` downloads every `SHELL` file with `cache:'reload'`; `./` and `index.html` must pass `appOnly()`. Only if every file succeeds is the new cache written and the browser's `self.skipWaiting` called; otherwise the install fails and the current version and its cache stay in use |
| Shell rule (v4.22) | the offline shell is only ever the real app: `isApp()` requires the version declaration, `isShellUrl()` is the scope's own `/` or `index.html`; `shellFromCache()` reads this version's cache first and `miz-shell` only if it passes `isApp()` |
| Activate | deletes every cache not in `KEEP`, then claims clients |
| Navigation | answers from the cached shell first and refreshes it from the network in the background through `saveShell()` (validated) |
| Other requests | cache first; same-origin and Google-font responses are added to the versioned cache, except shell URLs, which are never cached on this path |
| Share target | `POST ./share-target` is stored in `miz-share` and redirected to `./?share=1` |


## 4. Code regions inside `index.html`

The script is divided by banner comments of the form `/* ---------- Title ---------- */`. The main regions, in order:

| Region | Contains |
|---|---|
| Jalali calendar, Domain model, State & data | dates, constants, `S`, storage, `save()` |
| Data safety | load integrity, unsent counter, shrink guard (`cloudBlock()`), snapshots, recovery |
| Views and domain features | clinic, meetings, Quran research, occasions, CRM, weekly review |
| Integrations | GitHub backup, calendar feed, Google Calendar, bank messages |
| Money features | trips, recurring payments, net-profit entries, cheques, marketers |
| Documents | letterhead documents, item picker, row editor, posting (`postDoc()`), stock count, production |
| Registry and vault | assets, vault (encrypted fields), SandooghYar read-only view |
| Sync and safety | multi-device sync, safety card, data health (`healthIssues()`) |
| Main render | `render()`, planets home, domain pages |
| Forms and stock | sheets, drafts (`drSave()`), apiary, inventory, kardex |
| Accounting | double-entry accounting, year-end close, vouchers |
| Actions | the click switch and the submit handler |

## 5. Tests

See `tests/README.md`. The full suite runs in about 4 minutes and must pass before every push.
