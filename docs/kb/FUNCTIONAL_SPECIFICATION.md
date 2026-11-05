# Functional specification (what the app does, v4.45)

Describes implemented behaviour only. Data fields: [`../DATA.md`](../DATA.md). Workflows and atomicity: [DATA_ARCHITECTURE.md](DATA_ARCHITECTURE.md) §3. User-facing change notes: «تازه‌ها» in the app (`WHATS_NEW`), summarised in [CHANGELOG.md](CHANGELOG.md).

## Navigation

Bottom tabs (today, people, money, documents/stock and more depending on the profile modules), a «+» quick-add that adapts to the page, «بیشتر» menu (`ACTS` list: settings, backup, integrity, tools). Every `<select>` opens a searchable right-to-left bottom list. Profile modules switch domains on/off (`PROF().mods`).

## Domains

| Domain | What the user can do | Main functions |
|---|---|---|
| Today | day plan, due items, follow-ups, insights, assistant entry | `vToday`, `mcal` |
| People / CRM | persons with roles (client, supplier, patient, marketer…), timeline of everything linked, stay-in-touch reminders, merge duplicates, filters that are remembered | `viewPerson`, `mergePeople` |
| Tasks & calendar | tasks with due dates, inbox, many tasks from a pasted list, weekly review (GTD), regular meetings, unified management calendar (tasks, appointments, receivables due, stock exceptions), occasions, Google Calendar mirror and gist feed | `mcal`, `gcSync` |
| Money | accounts (bank, cash) with opening balances; received / paid / receivable / payable rows; settle a row; receipts from shared bank SMS; recurring payments confirmed from the bank message; cheques; manual journal vouchers; statements per person and per account; prepayment/overpayment section; closing the financial year; soft lock dates | `formSettle`, `pendConfirm`, `personBal`, `stmtRows`, `arapGaps` |
| Documents | sale invoice, purchase invoice, sale/purchase return, proforma (with follow-up and conversion), letter, contract, stock count, production; versions (edit = new version), void/restore, print or save PDF, share as a file («ارسال»), honorific of the customer corrected against the first name | `formDoc`, `postDoc`, `docVoid`, `docHtml`, `docPrint` |
| Stock | lots (product, variety, packing, cost, source: bought / own / opening / loan / consignment), moves (sale, loss, adjustment, production input), smart packing, stock value by lot | `formLot`, `formLotSave`, `lotStat` |
| Sales & deals | deals, quotes from suppliers, campaigns, referral commission (marketer page) | — |
| Clinic | cases (TEB method), visits with fees, protocols, progress, import a prior history, de-identified AI help | `clinicSheet` |
| Apiary, trips, worship, assets, vault | apiary records; trips with destination tasks and costs; prayers, fasting (Hijri), Quran research, kinship, charity; assets and documents; PIN/biometric vault | — |
| Assistant & questions | one sentence → proposed actions (AI optional; forms do the saving); questions answered locally by the information engine | `asSheet`, `qExec` |
| Safety | file / encrypted / cloud backups, automatic snapshots, restore with preview, multi-device sync with conflicts, recovery mode for unreadable records, data health, read-only data integrity page, persistent-storage status | `backupSheet`, `integSheet`, `recoverySheet` |
| Licence | activation codes for sold copies | — |

Detailed per-version feature notes: [`../../HANDOFF.md`](../../HANDOFF.md).

## Cross-cutting behaviour

- Amounts typed in million toman, stored in toman; display rules in [PRODUCT_POLICIES.md](PRODUCT_POLICIES.md) §3.
- Undo bar after delete/void-like actions; every record keeps `hist`.
- Double-tapping «ثبت» never saves twice; a document form creates at most one document.
- Cloud mode (the in-Claude view) refuses multi-record operations and deletes with a message.
- Offline: the whole app works from the service-worker cache; updates only move to a higher version.

## Not implemented (do not assume)

Multi-user roles; server-side storage; automatic repair of data; automatic write-off of small differences; a separate web origin (planned, OR-1); the external observer beyond the in-app integrity page (proposed, [DATA_ARCHITECTURE.md](DATA_ARCHITECTURE.md) §8).
