# Reza Desk: Data Dictionary

- **Source:** repository state `af7854d` (v4.21).
- **Where data lives:** on the phone only, in IndexedDB `miz-kar`, store `docs`. Each record is `{k:'<collection>/<id>', col, doc}` (see `docs/ARCHITECTURE.md`).
- **Common fields on every record:** `id` (string), `created`, `updated` (ISO timestamps). Most records also have `void` (soft delete, which keeps the history) and often `hist` (edit history).
- **Field lists:** "main fields" were extracted from the object literals the code writes (`save()` and `putRaw()` calls). They are **observed, not exhaustive**, because some forms build their records dynamically.
- **Check:** `tests/05-docs.test.js` verifies that the collection table below matches `COLS` exactly.

## 1. Collections

| Collection | Purpose | Main fields (observed) | Links to |
|---|---|---|---|
| people | persons and organisations | name, phone, org, email, roles, status, note, hon, refBy, mergedInto, lastTouch | — (central) |
| deals | sales opportunities | title, personId, stage, value, nextDate, nextStep, status, closedAt | people |
| tasks | tasks, appointments, follow-ups | title, due, start, time, status, priority, area, personId, dealId, caseId, repeat, recurId, doneAt, pauseTo | people, deals, cases, recurs |
| ledger | single-entry money rows | kind (paid/received/receivable/payable), amount, currency, date, due, personId, category, acct, settled, refId, settles, docId, lotId, moveId, visitOf, netOf, pending | people, docs, lots, moves, cases/visits, ledger (refId) |
| inbox | quick captures | text, audio, processed | — |
| notes | notes and rules | (built dynamically) **[unverified field list]** | — |
| apiary | apiary log (move, harvest, census, treatment…) | type and the fields of `APT` (loc, hives, qty, from, to, what…), date | — |
| lots | stock lots (one per received batch) | product, variety, qty, unit, cost, currency, date, code, source (buy/own/open/prod/pack/loan/consign), supplierId, docId, packId, parentId, place, consign | people, docs, lots (parentId) |
| moves | stock movements out of or into a lot | kind (sale, gift, ret, loss, adj, xfer…), lotId, qty, price, date, personId, toName, docId, childLot | lots, people, docs |
| quotes | price quotes given or received | dir, personId, product, variety, price, unit, currency, date, qty, sentAt, sentVia | people |
| contacts | phone contacts imported (kept apart from people) | items | — |
| habits | habits | name, type, target, active, pausedUntil | — |
| checkins | habit check-ins per month | habitId, month, days | habits |
| vouchers | manual journal vouchers | date, desc, lines[{acc, dr, cr, personId, bank, refId, due, desc}], void | people (in lines) |
| cases | clinical cases | code, personId, status, plan, contact, outcome, lastVisit | people |
| visits | clinical visits | caseId, no, date, obs, interp, iv, response, scores, next, nextDate | cases |
| qtopics | Quran research topics | kw, from | — |
| qverses | verses linked to topics | topicId, s, a, a2, text, note, kws | qtopics |
| campaigns | batched group messages | title, msg, nums, batch, sent, meetId | meets |
| trips | trips | from, to, depDate, status, lesson, endedAt | — |
| recurs | recurring payments and receipts | title, dir, amount, day, cat, bank, active, lastGen | people |
| vault | encrypted vault records | salt, iv, ct, cred | — |
| assets | assets and documents registry | kind, title, parentId, personId, fields, pays, archived | people, assets (parentId) |
| meta | settings and system records (profile, chart-of-accounts additions `coaX`, accounts `accts`, deletion tombstones `tomb`, sync conflicts…) | id plus record-specific fields | — |
| ibadat | worship log, one record per day | date, prayers and other daily fields (written by `ibSave`) | — |
| wins | achievements and insights | type, text, area, personId, date | people, tasks, deals, trips |
| docs | documents: invoices, purchases, returns, proformas, letters, contracts, counts, production | type, no, date, personId, items[], led, status, posted, inv, redoOf, viaSale, dealId, memo | people, lots (items), docs (redoOf, viaSale), deals |
| cheques | cheques received and issued | dir, personId, amount, due, bank, no, sayad, linkId, about, status, hist | people |
| meets | regular weekly meetings | title, wd, from, to, place, members, active | people |

## 2. Authoritative sources (which data answers which question)

| Question | Authoritative source | Notes |
|---|---|---|
| Remaining quantity of a lot | `lots.qty` minus its live `moves`, computed by `lotStat()` | never stored |
| Stock value | Σ remaining × lot cost (`lotStat()`, `lotCost()`) | must equal account 1301 (test 20 invariant) |
| What a person owes or is owed | live ledger rows plus voucher person-lines on 1201/2101, computed by `personBal()` | must equal receivables − payables (test 20 invariant) |
| Account balances | `autoEntries()` → `balancesByAcc()` | derived at read time, never stored |
| Current version of a document | the live doc that is not the `redoOf` target of another live doc | at most one live version (tests 20 and 30 invariant) |
| Effect of a posted document | the lots, moves and ledger rows with its `docId` (`docLinked()`) | voided and restored together by `docVoid()` |

**Known duplicate or overlapping representations** (see `docs/BACKLOG.md`):

- Money is entered three ways (ledger rows, vouchers, and document postings) and combined by `autoEntries()`.
- People live in `people` and in phone `contacts`.
- Clinic appointments are `tasks` with a `caseId`.
- Calendar export exists twice: the legacy `.ics` feed and Google Calendar.

## 3. Chart of accounts (fixed codes)

| Code | Account | Type |
|---|---|---|
| 1101 | نقد و بانک (cash and banks; sub-ledger per bank) | asset |
| 1201 | حساب‌های دریافتنی (receivables) | asset |
| 1202 | طلب کالایی (goods lent out) | asset |
| 1301 | موجودی کالا (inventory) | asset |
| 1401 | سرمایه‌گذاری و دارایی | asset |
| 2101 | حساب‌های پرداختنی (payables) | liability |
| 2102 | بدهی کالایی (goods borrowed) | liability |
| 2201 | مالیات و عوارض پرداختنی | liability |
| 3101 | سرمایه (equity) | equity |
| 3201 | برداشت شخصی (drawings) | equity |
| 41xx | income categories, in the order of `CAT_IN_FIX`, then user categories | income |
| 4990 | برگشت از فروش و تخفیف | income (contra) |
| 4999 | درآمد دسته‌بندی‌نشده | income |
| 5001 | بهای تمام‌شدهٔ کالای فروش‌رفته (cost of goods sold) | expense |
| 51xx | expense categories, in the order of `CAT_OUT_FIX`, then user categories | expense |
| 5301 | هدیه، نذری و خیرات | expense |
| 5302 | ضایعات و کسری انبار | expense |
| 5303 | سود یا زیان تغییر قیمت کالای امانی | expense |
| 5999 | هزینهٔ دسته‌بندی‌نشده | expense |

Accounts the user adds inside a voucher are stored in `meta` record `coaX` and merged by `coaSync()`.

## 4. Other local storage (not in IndexedDB)

| Store | Content |
|---|---|
| IndexedDB `miz-kar-snap` | the last 10 full local snapshots (`snapTake()`, `snapList()`) |
| `localStorage` `miz.*` | settings, filter memory (`miz.uiF`), drafts (`miz.drafts`), recently deleted records (`miz.trash`), usage statistics, integration settings and credentials, licence |
| `sessionStorage` | per-session flags and short-lived sign-in state |

`lsBackup()` includes the `miz.*` keys in backups, except credentials and device-specific keys (the exclusion list `LS_SKIP`).
