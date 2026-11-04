# Reza Desk (میز کار رضا): Architecture

This document describes app v4.45 (branch `audit-4.45`, committed and pushed; PR #6 open, not merged); `main` is `9ade5e7`, v4.44 released.
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
| `js/core.js` | core utilities (Jalali calendar, dates, digits, escaping, number and money formatting); classic script loaded before the main script, version marker `CORE_VER` = `APP_VER` |
| `js/engine.js` | information engine (`QE`, `qNorm`, `qExec`, `qHtml`, `aiRun`; read-only); classic script loaded after `js/core.js` and before the main script, version marker `ENGINE_VER` = `APP_VER` |
| `js/store.js` | storage transactions: `Store.tx(plan)` commits queued writes in one IndexedDB transaction and applies memory changes (`w.after`) only after it completed; serialised; used by `save0`/`putRaw` in local mode; version marker `STORE_VER` = `APP_VER` |
| `js/backup.js` | automatic local backups (snapshots in IndexedDB `miz-kar-snap`: take, verify, de-duplicate, retain, start-up/update copies, status); classic script loaded after `js/engine.js`, version marker `BACKUP_VER` = `APP_VER` |
| `fonts/Vazirmatn-wght.woff2`, `fonts/OFL.txt` | the Vazirmatn font v33.003 (one variable file, weights 100–900, 111 KB) and its licence (SIL Open Font License 1.1, which allows bundling with the licence kept alongside); declared by an `@font-face` in `index.html`; printed pages get it through `fontFace()` with an absolute address |
| `tools/` | developer tools, never loaded by the app: `q.js` (find code), `version.js` (version check and bump, see `docs/RELEASE.md`), `parse.js`, reference generators |
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
   - the shop-website catalogue (`syncCatalog()`; the CSP `connect-src` allows exactly `https://asalereza.com` and `https://www.asalereza.com`, 4.44)
   - the update check

   The font is bundled (`fonts/Vazirmatn-wght.woff2`, v4.41); no font service is contacted.

   If any of them fails, core work is unaffected.
4. Cloud backup and sync are sent **only encrypted**. Without a passphrase nothing is uploaded (v4.21; `tests/70-backup-security.test.js`).

## 3. Runtime structure

### 3.1 State and persistence

| Concept | Implementation |
|---|---|
| In-memory database | `const S={people:[],…}`: 29 arrays, one per collection (`COLS=Object.keys(S)`). See `docs/DATA.md`. |
| Storage | IndexedDB database `miz-kar`, one object store `docs`, records `{k:'<collection>/<id>', col, doc}`, written through `Store.tx()` (`js/store.js`: one transaction per call, memory updated only after it completed). At start `initDb()` loads everything into `S`. |
| Write path | `save()` (closed-period and date-lock checks; record history is kept by the individual forms) → `save0()`, or `putRaw()` for raw records → `Store.tx()` (local mode; cloud mode writes `db.collection` directly). Memory (`S`), undo (`undoRec`) and `markDirty()` (bumps `window._dv`, the data version, and the unsent counter) follow a successful transaction; a failed one changes nothing. Deletion: one helper `delRaw(col,id,B)` — inside an operation `Store.stageDel` (memory now, disk at commit, restored on rollback), otherwise one `Store.tx` with the ownership check; `delDoc()` uses `Store.tx` directly. `idbPut`/`idbDel` are removed; no direct IndexedDB write or delete exists outside `js/store.js` (checked by test 64). Restore (`applyData`, `restoreApply0`), sync (`syncMerge` → `syncMerge0(data,B)`), conflict resolution (`confPick`) and undo (`undoDo`) are operations (`Store.batch` keys `apply`, `restore`, `sync`, `conflict`, `undo`): all their writes, deletes, tombstones (`tombAdd(col,id,B)`) and conflict lists (`confSave(list,B)`) are one transaction or nothing. An ordinary transaction that completes for a record an active operation has staged meanwhile makes that operation fail (`conflict:` error) and its rollback uses the committed record. A save of a record that existed when it was asked for (or is being deleted by the running operation) but is gone at its turn is refused (no stub record); a save to an unknown id still creates it, as before. Quiet changes are per operation or per write, never a global flag across awaits: `Store.batch(key, fn, {quiet:true})` (sync) and `putRaw(col,doc,B,true)` (`confSave` inside an operation); an ordinary save made while a sync waits or runs counts normally. `confPick` stages a new conflict list instead of changing the live one, read inside its operation right before staging (a list changed by a sync during `snapTake()` is not overwritten); `delDoc` (local) is one operation — delete, tombstone and undo entry — and changes the trash and drafts (localStorage) only after the commit; `restoreApply0` makes its plan inside its operation; `undoDo` keeps `window._undo` until the commit succeeded (retry after a failure). Cloud mode (inside Claude): there is no multi-record transaction, so `Store.batch` refuses every multi-record operation (posting, void, merge, restore, sync, conflict choice, undo) with a message (`Store.CLOUD_MSG`) instead of running it half; single-record saves still work there; deletion (`delDoc`, `delRaw`) is refused in cloud mode (`DEL_CLOUD_MSG`) until a safe tombstone exists there — no undo entry, trash or draft change is made. Multi-record operations `postDoc`, `docVoid`, `mergePeople` run inside `Store.batch(key, fn)`: `fn(B)` gets the operation B and writes only through it (`opsFor(B)` binds `save`/`putRaw`/`personByName`/`openFlow`/`closeFlows` to B; the bodies are factories `mkPostDoc0`, `mkDocVoid0`, `mkMergePeople0`, …). B's writes are staged in memory and committed in one transaction at the end; any failure restores memory and B's own undo entries and writes nothing. There is no global current operation: a write or delete without B commits on its own; the ownership check runs inside `Store.tx`'s own turn, right before the transaction opens — if a record is staged by the active operation, the turn is given back (`_RETRY`), the call waits for `Store.idle()` and rebuilds from the real state, repeatedly (the queue is never blocked, so the operation's own commit `tx(…, true)` cannot deadlock); an operation staging a record that an ordinary transaction is writing at that moment waits for it (`Store.settle`, `_inflight`). Writes made by `save()` itself (next occurrence of a repeating task, `lockAfter`'s reconciliation flag) carry B. External outputs read committed state through `Store.read(fn)` at the read itself (waiting only at the start of a function is not enough when other awaits — a dialog, a network call, listing copies — come before the read): `snapTake` (the copy), `bk2` (after its dialog), `ghPush0` and `ghSync` (the uploaded snapshot; the unsent counter is cleared only if nothing changed since that read, otherwise the changes stay unsent), `gcSync` (the plan after network calls). They also wait for `Store.idle()` at the start: `snapTake`, `doBackup`, `bk2`, «backupLocal», `xlsxExport`, `ghPush0`, `ghSync`, `calPush`, `gcSync`. Nested operations: `B.batch()` throws («nested operation»); operation bodies must not call `postDoc`/`docVoid`/`mergePeople`/`Store.batch` (checked by test 63). Dialog waits: an operation that shows a confirmation keeps its records held (other writes to them and the next operation wait) until it is answered; no IndexedDB transaction is open meanwhile. Proposed (not built): a small «در حال ثبت…» indicator while `Store._act` is set; no automatic cancellation; operations are queued, never joined (each commits or rolls back on its own); one run per key at a time (`Store.BUSY`, also while queued); `doc.posted`, `person.mergedInto` and `docVoidDone()` (document and all linked rows already in the requested state) make repeats no-ops, and an inconsistent (half-voided) document is completed. |
| Derived data | `dataSig()` hashes the data once per tick. `autoEntries()`, `personBal()` and `remMap()` are memoised on it. |
| Local snapshots | `js/backup.js`; separate IndexedDB `miz-kar-snap`, store `snaps`; `snapTake()` stores a full copy (daily; before restore, rollback, sync, conflict fix, delete and the update button; first start of a new version, `snapBoot()`), verifies it after writing (`snapCheck()`: parses, row counts match), skips a copy identical to the newest (`h` fingerprint), keeps up to 10 (5 when storage is over 80% used) and never drops the newest daily copy or the one with the most rows (`snapKeep()`); a damaged copy is marked and cannot be restored |
| Settings | `localStorage` keys prefixed `miz.`; filter and UI memory in `miz.uiF` (`uiKeep()`) |
| Alternative mode | when running inside a Claude artifact (`window.claude.use('db')`), the cloud collection API replaces IndexedDB (`initDb()`) |

### 3.2 User interface

| Concept | Implementation |
|---|---|
| Views | `render()` rebuilds `#view` from the current `tab`: `vHome()` (planets), `vDom()` (domain page), `vToday()`, `vTasks()`, `vPeople()`, `vMoney()` |
| Navigation | `goTab()` with `history.pushState`; the phone back button goes one step |
| Sheets (pages over the view) | `openSheet()` pushes onto a stack (`SST`); `sheetBack()` and `closeSheet()` pop it |
| Actions | one delegated click handler with one `switch(a)` over `data-act` values (about 580 cases). `tests/00-static.test.js` enforces that every action name is unique; `tests/01-wiring.test.js` that every `data-act` and `data-form` has a handler. Click actions that write money or stock outside documents live in the region «Stock & money actions» as named functions (`actLotVoid()` … `actAcctFix()`); their cases only delegate. Submit branches that settle debts and clear cheques live in «Money forms» (`formSettle()`, `formSettleAll()`, `formChqClear()`, `formChqEndorse()`, sharing `ledSettleIfPaid()`). Saving a document, a stock lot, a referral sale or a net-profit entry is done by `formDocSave()`, `formLotSave()`, `formRefSale()` and `formNetSave()`; the submit handler only dispatches to them. The same holds for every other form that writes ledger rows (region «Ledger, stock-move, recurring, production and voucher forms»): no submit branch writes `ledger` itself. To find code without reading the whole file: `node tools/q.js` (see `tests/README.md`). |
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
| Multi-device sync | `ghSync()`, `syncMerge()` | same | requires a passphrase; newer copy wins when only one side changed; both-sided edits, first-sync differences and a remote deletion of an unsynced local edit become conflicts the user resolves (`conflictsSheet`) |
| Restore | `doRestore()` (file), `restoreJson()` → preview → `restoreApply()`; decrypt with `ghUnpack()` | — | additive; snapshot taken first |
| Calendar feed (legacy) | `calFeed()`, `calPush()` | same as GitHub backup | only when the user enables it; events about clinic clients get generic titles (`calPatients()`, `calScrubber()`) |
| Google Calendar | `gcItems()`, `gcSync()` | sign-in token kept for the current browser session only (the non-secret OAuth client ID is an ordinary setting and is included in backups) | per-item or bulk approval |
| Gemini AI | `aiCall()`; clinical text passes through `deid()` | the user's own key, kept in the phone's browser storage only; excluded from backups | only with the user's key |
| Update check | `checkUpdate()`, `stashLatest()`, `doUpdate()` | — | updates only to a **higher** version |

### 3.5 Service worker (`sw.js`)

| Aspect | Behaviour |
|---|---|
| Cache names | `miz-kar-v<version>` (the versioned app shell), `miz-shell` (last-resort copy of `index.html`), `miz-share` (incoming shares) |
| Pre-cached files (`SHELL`) | `./`, `index.html`, `manifest.webmanifest`, `icon2-192.png`, `icon2-512.png`, `icon2-maskable-512.png`, `logo.webp`, `qr.js`, `js/core.js`, `js/engine.js`, `js/backup.js`, `js/store.js`, `fonts/Vazirmatn-wght.woff2` |
| Install | `fetchAll()` downloads every `SHELL` file with `cache:'reload'`; `./` and `index.html` must pass `appOnly()`. Only if every file succeeds is the new cache written and the browser's `self.skipWaiting` called; otherwise the install fails and the current version and its cache stay in use |
| Shell rule (v4.22) | the offline shell is only ever the real app: `isApp()` requires the version declaration, `isShellUrl()` is the scope's own `/` or `index.html`; `shellFromCache()` reads this version's cache first and `miz-shell` only if it passes `isApp()` |
| Activate | deletes every cache not in `KEEP`, then claims clients |
| Navigation | answers from the cached shell first and refreshes it from the network in the background through `saveShell()` (validated) |
| Other requests | cache first; only same-origin responses are added to the versioned cache (v4.41: the Google-font exception is gone), except shell URLs, which are never cached on this path; other origins are not handled |
| Share target | `POST ./share-target` is stored in `miz-share` and redirected to `./?share=1` |


### 3.6 Data-integrity diagnostics (WP-3, v4.41)

- `integCheck()` reads memory only (`S`, `BAD`) and returns findings grouped by kind: the books (trial balance, unbalanced entries, person balances against receivables − payables, stock value against account 1301; toman only), two live versions of one document (the D1 case; `d1When()` dates it: «before» when the older version has not changed since `D1_FIX` (4.21 published), «after» when the newer version was itself created after the fix, «maybe» when the newer version predates the fix but the older one changed after it — any later save moves `updated` — listed with D1 and marked uncertain), two live replacements of one version, live lots/moves/ledger rows of a voided or missing document, moves of a voided or missing lot, lots below zero, rows of a missing or merged person and settlements of a missing row, one bank receipt key (`rcpt`) on several live rows, and records unreadable at start-up.
- `integSheet()` shows them (menu «تنظیمات» → «عیب‌یابی داده‌ها», action `integ`); every finding opens its record through `integGo()` (4.43): documents `docView`, ledger rows `viewLedger`, voucher lines their voucher (`logOpen`), lots `viewLot`, moves `viewMove`, cheques `chqView`, people `viewPerson`; the books group the journal (`accTab`), unreadable records the recovery page (`recovOpen`). `integText()` is the copyable report (action `integCopy`).
- Read-only and private by construction: nothing is written, repaired or deleted (test 68 counts IndexedDB and storage writes); findings name records by type, date, document number, lot code and record key only — never a person's name, an amount, a description or clinical content. Repairs stay with the owner (DEC-1 and similar decisions are untouched).

### 3.6b Receivables and payables: net balance and open rows (v4.42)

Two calculations exist on purpose and must agree:

| What | Function | Used by |
|---|---|---|
| net balance of a person | `balances()`, `personBal()`, `stmtRows()` — signed sum of rows that `affects()`; ignores «تسویه‌شده» | person page, people tab, money tab «مانده هر طرف حساب», statement |
| what is still open per row | `remMap()` / `remOf()` — amount minus linked payments (`refId`), pooled payments (`settles` without a live target), netting of the person's receivables and payables; a row with `settled` is 0 | aging lists, `dueLedger()`, person page «طلب سررسیده», settle form, follow-ups, health, engine |

They agree as long as `settled` matches the linked payments. `settled` is stored, so every edit that changes an amount, a person or a linked payment recomputes it: `ledSnap(ids)` before, `ledSync(snap,why,B)` after (`formLedgerEditSave()`, `formMoveEditSave()`, the purchase amount sync in `formLotSave()`; `ledReopen()` after voiding a payment). Only rows whose state agreed with their payments before the edit are recomputed, so a row settled by hand without full payment (discount, forgiveness, agreement) is never reopened; each change is written to the row's `hist`. In `formLedgerEditSave()` the row, the payments that follow it to another person and the flag are one operation (`Store.batch('ledEdit:<id>')`, local mode). A payment that settles a row of another person cannot be moved alone. The books (`autoEntries()`) do not read `settled`.

`remMap()` pools the excess of payments linked to a row (linked − amount > 0) with the person's unlinked payments, so an entry that balances an overpayment (a voucher refund) is covered (4.43). A row reopened by `ledSync()` also reopens the person's closed receivable follow-up (`recvReopen()`, shared with `ledReopen()`; one task per person, none created). Money paid beyond the open rows (prepayment, overpayment) is part of the net balance but of no row: `arapGaps()` lists it read-only in «پیش‌دریافت، اضافه‌پرداخت و اختلاف» (money tab, «طلب و بدهی»), with a mark when the person has rows from `ledSuspect()` (settled with less paid, paid more than the amount, fully paid but open), which «عیب‌یابی داده‌ها» also lists (group `setl`).

### 3.7 Who writes document postings (WP-7 review, WP-7b, v4.41)

A posting is a lot, stock move or ledger row with `docId`. Writers found in the code (`node tools/q.js writers ledger|moves|lots`):

| Writer | What | Atomic |
|---|---|---|
| `postDoc()` → `postDoc0` (factory `mkPostDoc0`) | invoices, purchases, returns and their lots, moves and ledger rows | yes (`Store.batch`) |
| `docVoid()` → `docVoid0` | voids or restores a document with everything `docLinked()` finds; restoring a version is refused while a newer (`docSuccessor()`) or an older (`docLiveAncestor()`) version of it is live | yes (`Store.batch`) |
| `formProdSave()` | production: output lot, input moves, cost rows and the production sheet | yes since 4.41 (`opRun('prod:…')`) |
| the `count` form | stock count: `loss`/`adj` moves, opening lots and the count sheet | yes since 4.41 (`opRun('count:…')`) |

`opRun(key,fn)` is the small wrapper for form-level postings: `fn(pr)` writes only through `pr(col,doc)` (= `putRaw` inside the operation), and a failure, cloud mode or a second run shows a message and writes nothing. The stock-in form (`formLotSave()`) saves a lot with its money rows as one operation in local mode (`Store.batch('lot:…')`, 4.44); cloud mode writes them one after another. `Store` owns persistence and atomicity only; business rules stay in the operation bodies; cloud mode keeps refusing multi-record operations.

Submitting forms: one delegated submit handler; while a form's submit is running, a second submit of the same form is ignored (`data-busy` on the form, the start time), so a double tap never writes twice. The lock lasts until the first submit has really ended (no expiry: an expiry let a second run start while the first was still posting and wrote a second document); after 20 s a further tap only shows how to recover (close and reopen the form; the draft stays). Operation level for documents: `formDocSave()` gives the form one id for its new document (`data-nid`); a repeated submit of the same form reaches that document — posted or being posted (`Store._busy` `post:<id>`) → refused, saved but not posted → completed — so one form never creates two documents. Cloud mode: production and stock count are multi-record operations, so they are refused there like posting and voiding.

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
| Sync and safety | multi-device sync, safety card, data health (`healthIssues()`: problems with a way to fix them), data-integrity diagnostics (`integCheck()`, `integSheet()`, `integText()`: read-only, see §3.6) |
| Main render | `render()`, planets home, domain pages |
| Forms and stock | sheets, drafts (`drSave()`), apiary, inventory, kardex |
| Accounting | double-entry accounting, year-end close, vouchers |
| Actions | the click switch and the submit handler |

## 5. Tests

See `tests/README.md`. The full suite runs in about 6 minutes and must pass before every push.

## Adding a separate file (part)
A part is a classic script in `js/` that declares `const <NAME>_VER='<APP_VER>';`. Add it in four places: `PARTS` in `sw.js`, `APP_PARTS` and a `<script src>` tag (same order, before the main script) in `index.html`, and the start-up guard (`PV` and the `<NAME>_VER===APP_VER` check). `tests/00-static.test.js` fails if any place is missed; `tests/47-core-shell.test.js` then covers install, refresh and offline for every part.

