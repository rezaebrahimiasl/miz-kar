# Calculation rules (extracted from the code)

Every formula below was read from the code on `main` at `5dfabe5` (v4.45) on 2026-11-06. Line numbers are approximate and will drift, so search by function name (`node tools/q.js fn <name> --full`). Each statement carries one of three labels:

- **[CODE]** — what the code actually does (read directly; this is not a judgement that it is correct).
- **[RULE]** — a product rule the owner approved (source given). If [CODE] and [RULE] disagree, that is a defect to report, not something to fix silently.
- **[OPEN]** — ambiguous, unverified, or waiting for an owner decision. Do not resolve these without the owner ([DECISION_REGISTER.md](DECISION_REGISTER.md)).

This document records no new financial or accounting decision. Where the meaning is undecided, it says so.

How it fits the rest of the system: the data each calculation reads is described in [`../DATA.md`](../DATA.md) §1–3; the authoritative source for each question is in [`../DATA.md`](../DATA.md) §2. The write paths that produce the rows are in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) §3.1 and §3.7 and [DATA_ARCHITECTURE.md](DATA_ARCHITECTURE.md) §3. Invariants are in [DATA_ARCHITECTURE.md](DATA_ARCHITECTURE.md) §5.

## 0. Ownership: who calculates and who writes

| Layer | Functions | Writes data? |
|---|---|---|
| Stored facts | `S.ledger` (single-entry money rows), `S.docs`, `S.lots`, `S.moves`, `S.vouchers` (manual journal), `S.recurs`, `meta/accts` | written only via `save`/`putRaw` inside forms and `Store.batch` |
| Derived, read-only | `personBal`, `balances`, `remMap`/`remOf`, `autoEntries`, `balancesByAcc`, `glBal`, `plRange`, `lotStat`, `lotCost`, `docTotal`, `arapGaps`, `ledSuspect`, `dueLedger`, `recvDue` | **no** — they are pure and recomputed on demand |
| Stored derived flag | `ledger.settled` (recomputed by `ledSync` only for rows that agreed before an edit) | yes, with a `hist` entry |
| Generators | `postDoc0` (document → lots, moves, ledger rows), `recurRun` (recurring rows/tasks) | yes |

The double-entry ledger is **never stored**: `autoEntries()` derives it every time from the single-entry rows, lots, moves, opening balances and manual vouchers [CODE]. Caching uses `dataSig()`, a hash of collection lengths, `updated`/`created`, `void` and `settled` [CODE].

## 1. Money units, rounding and display

| Item | Rule | Where |
|---|---|---|
| Storage unit | toman, as a number [CODE] | all `amount`, `price`, `cost` fields |
| Entry unit | million toman for the toman currency; other currencies as typed [CODE] [RULE: PRODUCT_POLICIES §3.2] | `toBase(x,c)` = `round(x·10⁷)/10` when currency is toman, else `x` (js/core.js `toBase`) |
| Back to entry unit | `fromBase(x,c)` = `round(x·10)/10⁷` for toman [CODE] | js/core.js |
| Stored precision | 0.1 toman (= 1 rial) [CODE] | `toBase` |
| "Is toman" | `MIL(c)`: currency empty or `'تومان'` [CODE] | js/core.js |
| Currencies | `CUR` = toman, dollar, euro, dirham, Omani rial. «ریال عمان» is a foreign currency, **not** the Iranian rial [CODE] | index.html `CUR` |
| Rial display | `rialTxt(v)` = `round(|v|·10)` rial; `tmR(v)` = toman rounded to 0.1 + « تومان معادل … ریال» [CODE]. Release notes 3.38 and the «تومان معادل ریال» note define where this appears (invoice/form totals, vouchers, bank receipts, reconciliation differences, amounts below 1 toman) [RULE] | js/core.js `rialTxt`, `tmR`, `rlS` |
| Short display | `money(v,c)` when short mode is on: <1 → `tmR`; <1000 → toman; <10⁵ → thousand toman; otherwise million with one decimal [CODE] | index.html `money` |
| Full display | `moneyFull`: ≥10⁶ → million toman with up to `MD`=7 decimals (exact toman if not a multiple of 1000); ≥1000 → thousand toman; <1 → `tmR` [CODE] | js/core.js |
| Parsed text | voice/typed text: «میلیون» ×1, «هزار» ÷1000 (or ÷10⁴ for «هزار ریال»), «تومان» ÷10⁶, «ریال» ÷10⁷ — result in million toman [CODE] | index.html parser near `CLIN_RX` (≈L442) |
| Bank message | the receipt parser takes the largest number after «مبلغ/برداشت/واریز» and labels it rial when no unit follows [CODE]; the exact conversion step was not traced in this pass [OPEN] | ≈L1591 |
| "Open" threshold | an amount counts as open/different only above **0.5 toman** [CODE] | `remMap`, `arapGaps`, `ledSuspect`, `dueLedger`, `recvDue` |
| Rounding of totals | no rounding at aggregation; only at entry (`toBase`), document discount/tax (0.1 toman), stock cost postings (`Math.round` to whole toman), and display [CODE] | §4, §6 |

[OPEN] DEC-3: there is no tolerance or write-off for small differences; they are reported («ماندهٔ جزئی») only.

## 2. Person balances (net) — `affects`, `balances`, `personBal`

[CODE] index.html `affects`, `balances`, `personBal`; sign table `LK`:

| Row kind | Sign `LK[kind].s` | Meaning |
|---|---|---|
| `receivable` | +1 | they owe me |
| `payable` | −1 | I owe them |
| `received` | −1 | money in from them |
| `paid` | +1 | money out to them |

- Rows counted: `PL()` = `S.ledger` + `vchPL()` (voucher lines on accounts 1201/2101 that carry a person; a debit line counts as `receivable`, a credit line as `payable`, both marked settled).
- A row affects a balance when `!void` **and** (kind is receivable/payable **or** it has `refId` **or** `settles`). A plain cash sale or expense with no link does not move a person's balance.
- `personBal()[personId][currency]` = Σ sign × amount, kept **per currency**; `balances(personId)` is the same sum for one person (or all people).
- Positive = the person owes me; negative = I owe the person.

Invariant (tests): Σ toman person balances = (1201 debit − credit) + (2101 debit − credit) (`invariants()` in `tests/lib.js`).

## 3. Open rows per receivable/payable — `remMap`, `remOf`

[CODE] index.html `remMap` (ARAP-3 comments in the code), `remOf`, voucher lines through `vchRem()`.

Per person and currency group:

1. For each receivable/payable row: `linked` = Σ amounts of rows whose `refId` is this row; remaining `R = settled ? 0 : max(0, amount − linked)`.
2. **Excess pool (ARAP-3):** if payments *in the settling direction* (`received` for a receivable, `paid` for a payable) linked to the row exceed `amount + 0.5`, the excess goes to the pool for that kind. Refunds linked to the row do not grow the excess.
3. Unlinked settlements (`settles` without `refId`, or `refId` pointing outside the group) add to the pool: `received` → receivable pool, `paid` → payable pool.
4. `take(kind, pool)`: open rows sorted by `due` (else `date`), oldest first; each takes `min(pool, R)` while the pool is > 0.5.
5. **Netting:** `net = min(Σ open receivables, Σ open payables)`; if > 0.5, the same amount is taken from both sides (oldest first).
6. `remOf(l)` = `remMap()[l.id]`, or the row amount if absent.

[RULE] Approved scope (4.42/4.43): rows settled by hand are never reopened automatically; only rows whose stored `settled` agreed with their payments before an edit are recomputed (`ledSnap`/`ledSync`). The excess goes to other open rows in the settling direction only.

### Net vs open rows — `arapGaps`

[CODE] For each person (toman only): `gap = personBal − Σ(open receivable remOf) + Σ(open payable remOf)`, listed when |gap| > 0.5, with the number of suspect rows. This is the «پیش‌دریافت، اضافه‌پرداخت و اختلاف» section.

- A positive or negative gap usually means a prepayment or an overpayment (money with no open row to apply it to), a hand-settled row, or a data defect.
- [OPEN] How each case should be classified or booked is the owner's decision (ARAP-R, DEC-3). The code does not label prepayment vs overpayment beyond the sign of the gap.

### Suspect settled state — `ledPaid`, `ledSuspect`

[CODE] `ledPaid(id)` = Σ live rows with `refId = id`. `ledSuspect` flags each row:

- `less`: settled, but paid < amount − 0.5;
- `more`: paid > amount + 0.5;
- `open`: not settled, but paid ≥ amount − 0.5.

These are reported only; nothing is changed automatically.

## 4. Documents (invoice, purchase, returns) — `docTotal`, `postDoc0`

[CODE] index.html `docTotal`:

- Items counted: all except `pt` = `loan` or `sample`, and except services whose `sm` is `cod` (paid on delivery) or `cost` (`svOff`).
- `sub` = Σ qty × price.
- `base` = the same sum over discountable items (`discOK`: an explicit `nd` flag, else not a service — `src='svc'` or a description matching `SVCQ`, e.g. transport, packing, fee, wages).
- `disc` = `min(base, discP ? round(base·discP/10)/10 : disc)` (percent rounded to 0.1 toman; an amount discount is capped at the base).
- `tax` = `round((sub − disc)·tax/10)/10`.
- `total` = `sub − disc + tax`.

[CODE] `postDoc0` (a document becomes stored rows, inside one `Store.batch`; [`../ARCHITECTURE.md`](../ARCHITECTURE.md) §3.7):

- **Sale invoice:**
  - Each stock line becomes a `moves` row: `sale`, or a giving kind for gifts.
  - The money side becomes one ledger row per income category (`byCat`), in the chosen mode `led`: `receivable` (credit), `received` (cash) or `none`.
  - Tax is added to the first category row.
  - The discount is split across the discountable categories in proportion to `base`, rounded to 0.1 toman; the last category takes the remainder.
- **Services:**
  - A service paid separately becomes a `received` row with `settles`.
  - A `cost` service becomes a `paid` or `payable` row to the carrier.
- **Purchase:**
  - Each line becomes a lot (`source` = `buy`/`loan`/`own`/`open`, `cost` = unit price, `extra` = this line's share of shared costs).
  - The money side becomes `payable` or `paid` rows; separately paid lines become `paid` rows with `settles`.
- **Sale/purchase returns:**
  - Each line becomes a `ret`/`pret` move.
  - The money side becomes a row marked `netOff` that reduces the claim («کم از طلب/بدهی»).
- **Simultaneous payment** («دریافت/پرداخت همزمان»): `received`/`paid` rows with `refId` to the document's open rows, up to the amount paid.
- **Linked purchase for an invoice line** (`bPrice`): a lot plus a `payable`/`paid` row to the supplier.
- **Consignment-in line** (`nCost`): a lot plus a `payable` row «سهم صاحب کالای امانی».

[RULE] One live version per document (D1); editing makes a new version with `redoOf`; voiding (`docVoid0`) voids the linked rows. Test invariant: no two live versions.

[OPEN] Rounding of the discount split leaves the remainder on the last category; the effect on per-category reports has not been reviewed by the owner.

## 5. Derived double entry — `autoEntries`, `balancesByAcc`, `glBal`

[CODE] index.html `autoEntries` (ledger mapping), `catAcc(category, dir)` (category → account), `L(acc, dr, cr, personId)`.

- **Ledger rows** (not void, not pending, amount > 0):

  | Row | Debit | Credit |
  |---|---|---|
  | `received`, settling (`refId`/`settles`) | 1101 | 1201 (person) |
  | `received`, not settling | 1101 | income account of the category (minus tax → 2201) |
  | `paid`, settling | 2101 (person) | 1101 |
  | `paid`, not settling | category account (expense/asset) | 1101 |
  | `receivable` | 1201 (person) | income account (tax → 2201); loan category: 1101 |
  | `payable` | expense/asset account; loan category: 1101 | 2101 (person) |
  | `netOff` `received` (return) | 4990 for a sales return, else the income account | 1201 |
  | `netOff` `paid` | 2101 | the category account |
  | `paid` with `ret='sret'` | 4990 | 1101 |

  - Tax on a row is `min(amount, tax)`.
  - Category to account (`catAcc`): loan → 2101 (in) / 1201 (out); «خرید و تأمین کالا» → 1301; investment → 1401; personal categories → 3201; otherwise the category's own code.

- **Lots:**
  - Opening count (`source='open'`): 1301 / 3101 at `lotCost × qty`.
  - Consignment-in (`source='loan'`): 1301 / 2102 (supplier) at `cost × qty`.
  - Purchased lots post through their ledger rows (category → 1301).

- **Moves**, at the lot's cost: `v = round(lotCost × qty)`.

  | Move | Debit | Credit |
  |---|---|---|
  | `sale` | 5001 | 1301 |
  | gifts (`give`), `sample` | 5301 | 1301 |
  | `loss` | 5302 | 1301 |
  | `khums`, `self` | 3201 | 1301 |
  | `ret` | 1301 | 5001 |
  | `adj` | 1301 | 5302 |
  | `mine` | 1301 | 3101 |
  | `lend` | 1202 (person) | 1301 |
  | `getback` | 1301 | 1202 (person) |

  - `payback` (returning borrowed goods): 2102 at the weighted average cost of that supplier's loan lots of the product, against 1301 at this lot's cost; the difference goes to 5303.
  - `pret` posts through its ledger row.
  - Internal moves (`xfer`, `prodin`, `pack`, `use`) post nothing.

- **Opening bank balances:** `meta/accts` `open − acctPre(k)` → 1101 / 3101 (or the reverse when negative).
- **Manual vouchers:** their lines as entered.
- **Numbering and checks:** entries are sorted by date and then created time, and numbered per Jalali year. An entry whose |Σdr − Σcr| > 0.0001 is marked `unbal`.
- **Warnings:** a row without a category, or with a category in the wrong direction, gets a warning (`warn`).

[CODE] `balancesByAcc(entries, currency, from, to)` sums debit/credit per account and per person; filters by currency and date. `glBal(code)` = natural balance (debit − credit for asset/expense types, credit − debit otherwise; `ATYPE`), toman, all dates.

Invariants (tests): trial balance = 0; no unbalanced entry; stock value = 1301; person balances = 1201 + 2101 (natural debit sign).

[OPEN] DEC-2: a stock-in recorded «در حساب‌ها ثبت نشود» creates a lot with cost but no ledger row, so stock value ≠ 1301 for that lot. This is reported by the integrity page and not decided.

## 6. Stock — `lotStat`, `lotCost`, moves

[CODE] index.html `MOVE` (sign per kind), `lotStat`, `lotCost`.

- `lotCost(l)` = `cost + packCost + (extra + extraPack) / qty` (per unit; `qty` 0 treated as 1).
- `lotStat(l)`:
  - `out` = Σ over the lot's moves of −sign × qty, so outgoing moves add to `out`.
  - `rem` = `qty − out`.
  - `sold` and `rev` = Σ qty and qty × price over `sale` moves; `avg` = `rev / sold`.
  - `people` = distinct persons, excluding loss/return/payback/getback.
  - `age` = days since the lot date.
- **Stock value** (test invariant) = Σ over live lots with `rem` > 10⁻⁴ of `rem × lotCost`. It must equal account 1301.
- **Cost of goods sold** = `round(lotCost × qty)` per sale move, i.e. **specific identification by lot**: the lot is chosen on the sale line, by hand or by `autoLot`. There is no FIFO or average costing across lots, except in `payback` (above) [CODE].
- **Negative lots:** `rem < 0` violates an invariant and is reported by the integrity page (`neg`). For consignment lots, drawing more than is in stock grows the consigned quantity (`lotFixShort`; HANDOFF 4.x) [CODE as documented in HANDOFF].
- [OPEN] The suggested-price and margin hints (`refPrice`, `priceTips`) are advisory and were not extracted here.

## 7. Due dates, ageing, follow-ups

[CODE]

- `dueLedger(days)`: live, unsettled receivable/payable rows (ledger + voucher lines) with `due ≤ today + days` and `remOf > 0.5`, sorted by due date.
- `agingHtml()` buckets by days past due:
  - not due (≤ 0);
  - 1–30;
  - 31–60;
  - 61–90;
  - over 90.
- `recvDue()` (receivables follow-up): toman receivables with a person, unsettled, `due ≤ today + RECV_SOON` (7 days) and `remOf > 0.5`.
  - Grouped per person into `rem`, `over` (the part already past due) and the first due date.
  - `recvPlan` excludes people who already have a follow-up task. `RECV_AGAIN` = 3.
- [CODE] The old «overdue» query used linked payments only; since 4.29 the query engine uses `remOf` (BACKLOG QE-2).

## 8. Instalments and recurring payments — `recurNext`, `recurRun`

[CODE] index.html.

- **`recurNext(r, after)`** — the next date after `after`:
  - daily: +1 day;
  - yearly: the given Jalali month/day, next year if already passed;
  - weekly: the next matching weekday;
  - monthly: the next matching Jalali day. Days 30/31 fall on the month's last day when the month is shorter.
  - At most 400 steps are tried; otherwise the result is +30 days.
- **`recurRun()`** (from `bootJobs` at start-up):
  - For each active recurrence, generate every date up to today (at most 62 per run).
  - `left` (remaining instalments) is decremented per date; at 0 the recurrence becomes inactive, and the label shows «قسط n از total».
  - **Auto rows:** a `received`/`paid` ledger row with `pending` = true unless `confirm` is false, so it needs the owner's confirmation (`actPendOk`, `pendConfirm`).
  - **«behalf» (paid directly on my behalf):** a pair of rows, `received` (income or help) plus `paid`, linked by `pairId`.
  - **Not auto:** a task with `payAmt` instead of a money row.
  - [OPEN] Whether `recurRun` runs inside a `Store.batch` was not verified in this pass.
- **Pending rows** are excluded from `autoEntries` (`!l.pending`). They do count in `personBal` if they carry a person and a link; this was not verified separately [OPEN].
- [OPEN] There is no loan amortisation (interest/principal split) in the code; an «instalment» is a fixed recurring amount.

## 9. Reports and KPIs

[CODE]

- `plRange(from, to)` (js/engine.js `profit`, monthly up to 36 months):
  - `inc` = Σ(credit − debit) of income-type accounts (I);
  - `exp` = Σ(debit − credit) of expense-type accounts (X);
  - `profit` = `inc − exp`;
  - `pers` = drawings 3201 shown separately (not an expense).
  - Toman only. The default range is from the start of the Jalali year to today.
- Query engine (`qExec`, js/engine.js): entities sales, purchases, ledger, balance, overdue, income/expense (received/paid without settlements, pending or investments, by category), cheques, profit, statement.
  - Totals are kept per currency (BACKLOG QE-2).
  - `tests/core-ref.json` and `tests/engine-ref.json` pin the reference outputs.
- [OPEN] Not extracted in this revision (read the code before relying on them):
  - the money-tab tiles in `vMoney`;
  - `forecastHtml`;
  - `kindRows`;
  - the commission in `formSettleAll`;
  - cheque status;
  - year closing (`yearData`, account 3301);
  - bank reconciliation;
  - `grossLine`.

## 10. Tests that cover these rules

| Rule | Tests |
|---|---|
| Units, `toBase`, `tmR` | `tests/core-cases.js` with `core-ref.json`; 50 |
| Person balances | 25, 29, 42, 43, 50, 61, 74; `invariants()` |
| Open rows, ARAP-3, settled state, gaps | 29, 74 (`remOf`, `arapGaps`, `dueLedger`, `ledSync`) |
| Documents and postings | 27, 30, 50, 71, 72 |
| Double entry, trial balance | 20, 25, 50, 74; `invariants()` after every money/stock test (listed in 20–29, 41–44, 48, 50, 54–59, 61–64, 66, 67, 69, 71, 73, 74, 76) |
| Stock, cost, stock = 1301 | 20, 28, 30, 61, 73, 76; `invariants()` |
| Atomic writes for money operations | 59–67, 73, 74, 76 |
| Profit, query engine | 42, 43, `engine-ref.json` |
| Recurrence / instalments, ageing, `ledSuspect` | **no test names these functions directly** [OPEN: coverage gap] |

## 11. Change rule

Any change to a function named here must, in the same commit:

1. update this document;
2. add or adjust a test that fails on the previous commit;
3. keep `invariants()` passing;
4. if the change alters financial meaning, have an approved entry in [DECISION_REGISTER.md](DECISION_REGISTER.md) first.

The synchronisation checklist is in [AI_CONTINUATION_GUIDE.md](AI_CONTINUATION_GUIDE.md) §4.
