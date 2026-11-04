// WP-7b: production (formProdSave) and the stock count sheet post their lots, moves and ledger rows as one operation: a failure
// at any write leaves memory and database exactly as they were; success writes everything; cloud mode refuses instead of writing
// half. Failure injection (Store.stage). Synthetic data only.
const { serve, launch, openApp, settle, invariants, fill, test, run, assert } = require('./lib');
let srv, o, p;
const mem = () => p.evaluate(() => JSON.stringify(COLS.filter(c => c !== 'contacts').map(c => (S[c] || []).map(x => JSON.stringify(x)).sort())));
const disk = () => p.evaluate(() => new Promise(r => { const q = idb.transaction('docs').objectStore('docs').getAll(); q.onsuccess = () => r(JSON.stringify(q.result.filter(x => x.col !== 'contacts').map(x => x.k + JSON.stringify(x.doc)).sort())); }));
const failAt = col => p.evaluate(col => { if (!window._st) window._st = Store.stage; Store.stage = col ? function (B, c) { if (c === col) throw new Error('synthetic failure'); return window._st.apply(this, arguments); } : window._st; }, col);
const submit = () => p.evaluate(() => { const f = [...document.querySelectorAll('#sheetRoot form[data-form]')].pop(); (f.querySelector('button[type=submit]') || [...f.querySelectorAll('button.pri:not([type=button])')].pop()).click(); });
async function same(what, fn) { const m0 = await mem(), d0 = await disk(); await fn(); await p.waitForTimeout(300); await settle(p); assert((await mem()) === m0, what + ': memory changed'); assert((await disk()) === d0, what + ': database changed'); }

test('setup: one bought lot with its payable', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs(); await putRaw('people', { id: 's1', name: 'فروشندهٔ آزمون', created: n, updated: n });
    await putRaw('meta', { id: 'accts', a: { 'بانک الف': { open: 100e6, openDate: '2026-09-23', setAt: n } }, created: n, updated: n });
    await putRaw('lots', { id: 'L1', product: 'عسل', variety: 'آزمون', qty: 10, unit: 'کیلو', cost: 1e6, currency: 'تومان', date: '2026-10-01', code: '901', source: 'buy', supplierId: 's1', created: n, updated: n });
    await putRaw('ledger', { id: 'g1', kind: 'payable', personId: 's1', amount: 10e6, currency: 'تومان', category: 'خرید و تأمین کالا', lotId: 'L1', about: 'خرید (901)', date: '2026-10-01', instrument: 'نسیه', created: n, updated: n }); render(); });
  const v = await invariants(p); assert(!v.length, v.join('; ')); });

const openProd = async () => { await p.evaluate(() => { closeSheet(); formProd({}); }); await p.waitForSelector('#sheetRoot form[data-form=prod]');
  await fill(p, { f_prp: 'شربت آزمون', f_prq: '4', f_pru: 'عدد' });
  for (const a of ['prAdd', 'prX']) await p.evaluate(a => { const b = document.querySelector(`#sheetRoot [data-act=${a}]`); if (!document.querySelector(a === 'prAdd' ? '#prIn .prr' : '#prEx .prr')) b.click(); }, a);
  await p.evaluate(() => { const inr = document.querySelector('#prIn .prr'); const s = inr.querySelector('.pr_l'); if (s.tagName === 'SELECT' && ![...s.options].some(o => o.value === 'L1')) s.add(new Option('L1', 'L1')); s.value = 'L1'; inr.querySelector('.pr_q').value = '2';
    const ex = document.querySelector('#prEx .prr'); ex.querySelector('.pr_xd').value = 'برچسب آزمون'; ex.querySelector('.pr_xa').value = '0.5';
    const a = document.getElementById('f_pracct'); if (a) { if (a.tagName === 'SELECT' && ![...a.options].some(o => o.value === 'بانک الف')) a.add(new Option('بانک الف', 'بانک الف')); a.value = 'بانک الف'; } }); };

test('production: a failure at the cost row or at the sheet changes nothing; success writes lot, move, cost row and sheet together', async () => {
  for (const col of ['ledger', 'docs']) { await openProd(); await failAt(col); await same('production failure at ' + col, submit); await failAt(null);
    assert(await p.evaluate(() => /چیزی تغییر نکرد/.test(document.getElementById('toast').textContent)), 'no failure message'); }
  await openProd(); await submit(); await p.waitForTimeout(300); await settle(p);
  const r = await p.evaluate(() => { const l = S.lots.find(x => !x.void && x.source === 'prod'); return l && { qty: l.qty, ins: S.moves.filter(m => !m.void && m.kind === 'prodin' && m.childLot === l.id).length, cost: S.ledger.filter(x => !x.void && x.lotId === l.id).length, doc: !!S.docs.find(d => d.id === l.docId && d.type === 'prod') }; });
  assert(r && r.qty === 4 && r.ins === 1 && r.cost === 1 && r.doc, 'production: ' + JSON.stringify(r));
  const v = await invariants(p); assert(!v.length, v.join('; '));
});

const openCount = async () => { await p.evaluate(() => { closeSheet(); countSheet(); }); await p.waitForSelector('#sheetRoot form[data-form=count]');
  await p.evaluate(() => { const i = document.querySelector('#sheetRoot .cl_q[data-id="L1"]'); i.value = '۷'; i.dispatchEvent(new Event('input', { bubbles: true })); }); };

test('stock count: a failure at the count sheet changes nothing (no orphan correction); success writes the correction and the sheet', async () => {
  await openCount(); await failAt('docs'); await same('count failure at the sheet', submit); await failAt(null);
  await openCount(); await submit(); await p.waitForTimeout(300); await settle(p);
  const r = await p.evaluate(() => { const d = S.docs.find(x => !x.void && x.type === 'count'); return d && { moves: S.moves.filter(m => !m.void && m.docId === d.id).map(m => [m.kind, m.qty]), rem: lotStat(byId('lots', 'L1')).rem }; });
  assert(r && JSON.stringify(r.moves) === '[["loss",1]]' && Math.abs(r.rem - 7) < 1e-9, 'count: ' + JSON.stringify(r));
  const v = await invariants(p); assert(!v.length, v.join('; '));
});

test('cloud mode: production is refused with the message instead of being written half', async () => {
  await openProd(); const m0 = await mem();
  await p.evaluate(() => { mode = 'cloud'; }); try { await submit(); await p.waitForTimeout(300); } finally { await p.evaluate(() => { mode = 'local'; }); }
  assert((await mem()) === m0 && await p.evaluate(() => /حالت ابری/.test(document.getElementById('toast').textContent)), 'cloud production');
  assert(!o.errors.length, o.errors.join(' | '));
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
