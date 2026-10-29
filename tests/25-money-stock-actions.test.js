// The click actions that write money or stock outside documents: each one through the real click dispatcher, on
// synthetic fixtures, with its exact state change and the accounting/inventory invariants checked. Synthetic data only.
const { serve, launch, openApp, settle, invariants, openDoc, submit, test, run, assert } = require('./lib');
let srv, o, p;
const D0 = '2026-10-01';
// Click a data-act button the way the app does (inside the open sheet if there is one) and wait for its writes.
async function act(name, data = {}) {
  await p.evaluate(([name, data]) => { document.getElementById('toast').textContent = ''; const b = document.createElement('button'); b.type = 'button'; b.dataset.act = name;
    Object.assign(b.dataset, data); const r = document.getElementById('sheetRoot'); (r.hidden ? document.body : r).appendChild(b); window._tb = b; b.click(); }, [name, data]);
  await settle(p); return p.evaluate(() => ({ toast: document.getElementById('toast').textContent, label: window._tb.textContent, ds: { ...window._tb.dataset } }));
}
async function again() { await p.evaluate(() => { document.getElementById('toast').textContent = ''; window._tb.click(); }); await settle(p);
  return p.evaluate(() => ({ toast: document.getElementById('toast').textContent })); }
const get = (col, id) => p.evaluate(([c, i]) => { const x = byId(c, i); return x ? JSON.parse(JSON.stringify(x)) : null; }, [col, id]);
const put = rows => p.evaluate(async rows => { for (const [c, d] of rows) await putRaw(c, { created: nowTs(), updated: nowTs(), void: false, ...d }); render(); }, rows);
const inv = async (what) => { const v = await invariants(p); assert(!v.length, `${what}: invariants broken: ${v.join('; ')}`); };
const lot = (id, extra = {}) => ['lots', { id, product: 'عسل', variety: 'آزمون ' + id, source: 'buy', supplierId: 'p_s', date: D0, qty: 10, unit: 'کیلو', cost: 1e6, code: 'T-' + id, currency: 'تومان', ...extra }];
const buyRow = (id, lotId, amount, extra = {}) => ['ledger', { id, lotId, kind: 'payable', personId: 'p_s', amount, currency: 'تومان', about: 'خرید آزمون', category: 'خرید و تأمین کالا', instrument: 'نقد/کارت', date: D0, due: '', settled: false, ...extra }];
const move = (id, lotId, kind, qty, extra = {}) => ['moves', { id, lotId, kind, qty, personId: 'p_c', date: D0, price: 0, currency: 'تومان', ...extra }];

test('setup: clean device, synthetic people and one bank account', async () => {
  srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await put([['people', { id: 'p_s', name: 'تأمین‌کنندهٔ آزمون' }], ['people', { id: 'p_c', name: 'مشتری آزمون' }],
    ['meta', { id: 'accts', a: { 'بانک الف': { open: 100e6, openDate: D0 }, 'بانک ب': { open: 20e6, openDate: D0 } } }]]);
  await inv('fixtures');
});

test('lotVoid: first tap only asks; second tap voids the lot and its purchase row; a lot with moves is refused', async () => {
  await put([lot('L1'), buyRow('g1', 'L1', 10e6, { kind: 'paid', personId: '', acct: 'بانک الف' }), lot('L2'), buyRow('g2', 'L2', 10e6), move('m2', 'L2', 'sale', 3)]); await inv('before');
  const r1 = await act('lotVoid', { id: 'L1' }); assert(r1.ds.sure === '1' && r1.label.includes('مطمئنی') && !(await get('lots', 'L1')).void, 'first tap changed data or did not ask');
  const r2 = await again(); const L = await get('lots', 'L1'), g = await get('ledger', 'g1');
  assert(L.void && L.voidReason === 'حذف محموله T-L1' && g.void && g.voidReason === 'حذف محموله T-L1', 'lot/ledger not voided: ' + JSON.stringify({ L: L.void, g: g.void, r: g.voidReason }));
  assert(r2.toast.startsWith('حذف شد'), 'toast: ' + r2.toast); await inv('after lotVoid');
  await act('lotVoid', { id: 'L2' }); const r3 = await again(); assert(!(await get('lots', 'L2')).void && r3.toast.includes('گردش دارد'), 'lot with moves voided: ' + r3.toast);
});

test('logRestore (lots): restoring the deleted lot also restores its voided purchase row', async () => {
  await p.evaluate(() => logSheet()); await p.waitForSelector('#logRes');
  const r = await act('logRestore', { id: 'L1', c: 'lots' }); const L = await get('lots', 'L1'), g = await get('ledger', 'g1');
  assert(!L.void && !g.void && r.toast.startsWith('برگردانده شد'), 'not restored: ' + JSON.stringify({ L: L.void, g: g.void, t: r.toast })); await inv('after logRestore');
});

test('lotFixShort: a short own lot gets an «adj» move; a short consigned lot grows and owes its owner', async () => {
  await put([lot('L3'), buyRow('g3', 'L3', 10e6), move('m3', 'L3', 'sale', 12)]);
  let v = await invariants(p); assert(v.some(x => x.includes('negative lot')), 'fixture should start with a negative lot: ' + v.join('; '));
  await act('lotFixShort', { id: 'L3' }); const adj = await p.evaluate(() => S.moves.filter(m => !m.void && m.lotId === 'L3' && m.kind === 'adj').map(m => m.qty));
  assert(JSON.stringify(adj) === '[2]', 'adj move: ' + JSON.stringify(adj)); await inv('after lotFixShort (own)');
  await put([lot('L4', { consign: true }), buyRow('g4', 'L4', 10e6), move('m4', 'L4', 'sale', 13)]);
  const n0 = await p.evaluate(() => S.ledger.length); await act('lotFixShort', { id: 'L4' }); const L = await get('lots', 'L4');
  const pay = await p.evaluate(() => S.ledger.filter(x => !x.void && x.lotId === 'L4' && x.kind === 'payable' && x.id !== 'g4').map(x => [x.amount, x.personId]));
  assert(L.qty === 13 && L.hist.at(-1).from === 10 && L.hist.at(-1).to === 13, 'consigned lot qty/hist: ' + JSON.stringify([L.qty, L.hist]));
  assert(JSON.stringify(pay) === JSON.stringify([[3e6, 'p_s']]) && (await p.evaluate(() => S.ledger.length)) === n0 + 1, 'owner payable: ' + JSON.stringify(pay));
  await inv('after lotFixShort (consigned)');
});

test('lotFixMine: a short lot is filled with a «mine» move of exactly the shortage', async () => {
  await put([lot('L5'), buyRow('g5', 'L5', 10e6), move('m5', 'L5', 'sale', 11.5)]);
  await act('lotFixMine', { id: 'L5' }); const mm = await p.evaluate(() => S.moves.filter(m => !m.void && m.lotId === 'L5' && m.kind === 'mine').map(m => m.qty));
  assert(JSON.stringify(mm) === '[1.5]', 'mine move: ' + JSON.stringify(mm)); await inv('after lotFixMine');
});

test('lotMine: a move is re-marked as own goods; nothing else changes', async () => {
  await put([lot('L6', { source: 'loan', cost: 0 }), move('m6', 'L6', 'adj', 2, { note: 'اضافه' })]); await inv('before');
  const n0 = await p.evaluate(() => S.moves.length + S.ledger.length + S.lots.length);
  await act('lotMine', { id: 'm6' }); const m = await get('moves', 'm6');
  assert(m.kind === 'mine' && m.note === 'اضافه · از کالای خودم' && m.qty === 2, 'move: ' + JSON.stringify([m.kind, m.note, m.qty]));
  assert((await p.evaluate(() => S.moves.length + S.ledger.length + S.lots.length)) === n0, 'other records created'); await inv('after lotMine');
});

test('lotMineH: undoing a recorded increase of a borrowed lot lowers it and records the amount as own goods', async () => {
  await put([lot('L7', { source: 'loan', cost: 0, qty: 12, hist: [{ at: D0 + 'T08:00:00.000Z', from: 10, to: 12, why: 'کسری' }] }), move('m7', 'L7', 'sale', 11)]); await inv('before');
  await act('lotMineH', { id: 'L7', i: '0' }); const L = await get('lots', 'L7');
  const mm = await p.evaluate(() => S.moves.filter(m => !m.void && m.lotId === 'L7' && m.kind === 'mine').map(m => [m.qty, m.date]));
  assert(L.qty === 10 && L.hist[0].undone && L.hist.length === 2 && L.hist[1].from === 12 && L.hist[1].to === 10, 'lot: ' + JSON.stringify([L.qty, L.hist]));
  assert(JSON.stringify(mm) === JSON.stringify([[2, D0]]), 'mine move: ' + JSON.stringify(mm)); await inv('after lotMineH');
});

test('chqUndo: a cleared cheque goes back to «wait» and its clearing row is voided', async () => {
  await put([['cheques', { id: 'c1', dir: 'in', amount: 4e6, personId: 'p_c', due: D0, status: 'cleared', ledgerId: 'gc', no: '123' }],
    ['ledger', { id: 'gc', kind: 'received', personId: 'p_c', amount: 4e6, currency: 'تومان', acct: 'بانک الف', about: 'وصول چک', date: D0, instrument: 'چک', settled: false }]]); await inv('before');
  const r = await act('chqUndo', { id: 'c1' }); const c = await get('cheques', 'c1'), g = await get('ledger', 'gc');
  assert(c.status === 'wait' && c.ledgerId === '' && c.hist.at(-1).s === 'wait' && g.void && g.voidReason === 'برگشت وضعیت چک', 'cheque/ledger: ' + JSON.stringify([c.status, c.ledgerId, g.void]));
  assert(r.toast.includes('در جریان'), 'toast: ' + r.toast); await inv('after chqUndo');
});

test('pendOk / pendNo: a pending automatic payment pair is confirmed, or voided as «not done»', async () => {
  const row = (id, pair, kind, acct) => ['ledger', { id, pairId: pair, pending: true, kind, amount: 1e6, currency: 'تومان', acct, about: 'انتقال آزمون', date: D0, instrument: 'نقد/کارت', settled: false }];
  await put([row('q1', 'P1', 'paid', 'بانک الف'), row('q2', 'P1', 'received', 'بانک ب'), row('q3', 'P2', 'paid', 'بانک الف'), row('q4', 'P2', 'received', 'بانک ب')]); await inv('before');
  await act('pendOk', { id: 'q1' }); const ok = await p.evaluate(() => ['q1', 'q2'].map(i => [byId('ledger', i).pending, !!byId('ledger', i).void]));
  assert(JSON.stringify(ok) === '[[false,false],[false,false]]', 'pendOk: ' + JSON.stringify(ok));
  await act('pendNo', { id: 'q3' }); const no = await p.evaluate(() => ['q3', 'q4'].map(i => [byId('ledger', i).pending, byId('ledger', i).void, byId('ledger', i).voidReason]));
  assert(JSON.stringify(no) === JSON.stringify([[false, true, 'پرداخت خودکار انجام نشد'], [false, true, 'انجام نشد']]), 'pendNo: ' + JSON.stringify(no)); await inv('after pend');
});

test('lgSettle: first tap only asks; second tap marks the received row as settling a balance', async () => {
  await put([['ledger', { id: 'gs', kind: 'received', personId: 'p_c', amount: 2e6, currency: 'تومان', acct: 'بانک الف', about: 'دریافت آزمون', date: D0, instrument: 'نقد/کارت', settled: false }]]); await inv('before');
  const r1 = await act('lgSettle', { id: 'gs' }); assert(r1.ds.arm === '1' && !(await get('ledger', 'gs')).settles, 'first tap changed data');
  const r2 = await again(); assert((await get('ledger', 'gs')).settles === true && r2.toast.includes('از مانده کم شد'), 'not settled: ' + r2.toast); await inv('after lgSettle');
});

test('acctFix: a reconciliation difference becomes one received/paid row and the account is marked reconciled', async () => {
  const bal = () => p.evaluate(() => { const B = balancesByAcc(autoEntries(), 'تومان')['1101']; return B ? Math.round(B.dr - B.cr) : 0; });
  const b0 = await bal(), n0 = await p.evaluate(() => S.ledger.length);
  await act('acctFix', { v: 'بانک ب', d: '-750000' });
  const r = await p.evaluate(() => { const x = S.ledger[S.ledger.length - 1]; return { kind: x.kind, amount: x.amount, acct: x.acct, about: x.about, cat: x.category, rec: acctInfo()['بانک ب'].rec, stale: acctInfo()['بانک ب'].recStale, n: S.ledger.length }; });
  assert(r.n === n0 + 1 && r.kind === 'paid' && r.amount === 750000 && r.acct === 'بانک ب' && r.about === 'اختلاف تطبیق با بانک' && r.cat === 'شخصی: سایر', 'row: ' + JSON.stringify(r));
  assert(r.rec === (await p.evaluate(() => today())) && r.stale === false, 'not marked reconciled: ' + JSON.stringify(r));
  assert((await bal()) === b0 - 750000, `bank balance ${b0} → ${await bal()}`); await inv('after acctFix');
});

test('acctMerge: after confirmation every row, recurring payment and opening balance of one account moves to the other', async () => {
  await put([['ledger', { id: 'ga1', kind: 'paid', amount: 1e6, currency: 'تومان', acct: 'بانک ب', about: 'هزینهٔ آزمون', category: 'شخصی: سایر', date: D0, instrument: 'نقد/کارت', settled: false }],
    ['recurs', { id: 'r1', title: 'قسط آزمون', amount: 1e6, bank: 'بانک ب', every: 'month', day: 5, active: true }]]);
  const before = await p.evaluate(() => { const B = balancesByAcc(autoEntries(), 'تومان')['1101']; return { gl: Math.round(B.dr - B.cr), rows: S.ledger.filter(l => l.acct === 'بانک ب').map(l => l.id).sort(), A: acctInfo() }; });
  await p.evaluate(() => { const i = document.createElement('input'); i.id = 'f_amg'; i.value = 'بانک الف'; i.hidden = true; document.body.appendChild(i); });
  await act('acctMerge', { v: 'بانک ب' }); await p.waitForSelector('#dlgRoot [data-dv=ok]'); await p.click('#dlgRoot [data-dv=ok]'); await settle(p);
  const r = await p.evaluate(ids => ({ rows: ids.map(i => [byId('ledger', i).acct, byId('ledger', i).acctOld]), left: S.ledger.filter(l => l.acct === 'بانک ب').length, rec: byId('recurs', 'r1').bank, A: acctInfo(),
    gl: (B => Math.round(B.dr - B.cr))(balancesByAcc(autoEntries(), 'تومان')['1101']) }), before.rows);
  assert(r.left === 0 && r.rows.every(([a, o]) => a === 'بانک الف' && o === 'بانک ب'), 'rows: ' + JSON.stringify(r.rows));
  assert(r.rec === 'بانک الف' && !r.A['بانک ب'] && r.A['بانک الف'].open === before.A['بانک الف'].open + before.A['بانک ب'].open && r.A['بانک الف'].alias.includes('بانک ب') && r.A['بانک الف'].merged.at(-1).n === before.rows.length, 'accounts: ' + JSON.stringify(r.A));
  assert(r.gl === before.gl, `bank total changed ${before.gl} → ${r.gl}`); await inv('after acctMerge');
});

test('logRestore (docs): restoring a deleted purchase document brings back its lot and money rows', async () => {
  await openDoc(p, { type: 'purchase', personId: 'p_s', date: D0, led: 'payable', items: [{ desc: 'عسل سند آزمون', qty: 5, unit: 'کیلو', price: 1e6 }] }); await submit(p); await settle(p);
  const id = await p.evaluate(() => S.docs.find(d => !d.void && d.type === 'purchase').id);
  const live = () => p.evaluate(id => { const d = byId('docs', id); return { doc: !d.void, lots: S.lots.filter(l => !l.void && l.docId === id).length, rows: S.ledger.filter(l => !l.void && l.docId === id).length,
    owed: (personBal()['p_s'] || {})['تومان'] || 0 }; }, id);
  const before = await live(); assert(before.doc && before.lots === 1 && before.rows >= 1, 'document not posted: ' + JSON.stringify(before)); await inv('after posting');
  await p.evaluate(id => docVoid(id, true), id); await settle(p); const gone = await live();
  assert(!gone.doc && gone.lots === 0 && gone.rows === 0, 'document not deleted with its rows: ' + JSON.stringify(gone)); await inv('after deleting the document');
  await p.evaluate(() => { closeSheet(); logSheet(); }); await p.waitForSelector('#logRes');
  const r = await act('logRestore', { id, c: 'docs' }); const back = await live();
  assert(JSON.stringify(back) === JSON.stringify(before) && r.toast.startsWith('برگردانده شد'), `restored ${JSON.stringify(back)} ≠ before ${JSON.stringify(before)} · ${r.toast}`);
  await inv('after logRestore (docs)');
});

test('no page errors', async () => { assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
