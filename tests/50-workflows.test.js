// Three cross-module workflows through the real forms and buttons, with the accounting/inventory invariants after each step:
// clinic visit with a fee, a beekeeping harvest sold from stock, a task paid with a voucher. Synthetic data only.
const { serve, launch, openApp, settle, invariants, fill, submitForm, openDoc, test, run, assert } = require('./lib');
let srv, o, p;
const inv = async what => { const v = await invariants(p); assert(!v.length, `${what}: invariants broken: ${v.join('; ')}`); };

test('setup: clean device, synthetic patient, customer and bank account', async () => {
  srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs();
    await putRaw('people', { id: 'p_pt', name: 'مراجع آزمون', created: n, updated: n }); await putRaw('people', { id: 'p_cu', name: 'خریدار آزمون', created: n, updated: n });
    await putRaw('meta', { id: 'accts', a: { 'بانک الف': { open: 50e6, openDate: '2026-09-01' } }, created: n, updated: n });
    await putRaw('cases', { id: 'c_1', code: 'SYN-1', personId: 'p_pt', complaint: 'SYN-CLIN', status: 'open', created: n, updated: n }); render(); });
  await inv('fixtures');
});

test('clinic: a visit with a fee creates exactly one ledger row linked by visitOf; deleting the visit keeps the books consistent', async () => {
  await p.evaluate(() => { closeSheet(); formVisit('c_1'); }); await p.waitForSelector('#sheetRoot form[data-form=visit]');
  await fill(p, { f_vfee: '2', f_vpay: 'receivable' }); await submitForm(p); await settle(p);
  const r = await p.evaluate(() => { const v = S.visits.filter(x => !x.void && x.caseId === 'c_1'); const L = S.ledger.filter(l => !l.void && l.visitOf);
    return { visits: v.length, no: v[0] && v[0].no, id: v[0] && v[0].id, rows: L.map(l => ({ visitOf: l.visitOf, kind: l.kind, amount: l.amount, personId: l.personId })), expect: toBase(num('2'), 'تومان'), bal: (personBal()['p_pt'] || {})['تومان'] || 0 }; });
  assert(r.visits === 1 && r.rows.length === 1, 'visit/ledger rows: ' + JSON.stringify(r));
  assert(r.rows[0].visitOf === 'c_1#' + r.no && r.rows[0].kind === 'receivable' && r.rows[0].amount === r.expect && r.rows[0].personId === 'p_pt', 'fee row: ' + JSON.stringify(r.rows[0]));
  assert(r.bal === r.expect, `patient balance ${r.bal} ≠ fee ${r.expect}`); await inv('after the visit');
  // delete the visit (two taps), through the real button
  await p.evaluate(id => { closeSheet(); const b = document.createElement('button'); b.dataset.act = 'voidVisit'; b.dataset.id = id; document.body.appendChild(b); window._vb = b; }, r.id);
  await p.evaluate(() => window._vb.click()); await settle(p); assert(await p.evaluate(() => window._vb.dataset.sure === '1' && !S.visits.some(v => v.void)), 'first tap did not just ask');
  await p.evaluate(() => window._vb.click()); await settle(p);
  const after = await p.evaluate(id => ({ v: byId('visits', id).void, rows: S.ledger.filter(l => !l.void && l.visitOf).length }), r.id);
  assert(after.v === true, 'visit not deleted');
  // Current behaviour, recorded rather than judged: the fee row stays (money owed/received is not erased with the clinical note).
  assert(after.rows === 1, 'fee rows after deleting the visit: ' + after.rows); await inv('after deleting the visit');
});

test('beekeeping: a harvest («own production») becomes a lot; selling part of it moves stock and money consistently', async () => {
  await p.evaluate(() => { closeSheet(); formLot(); }); await p.waitForSelector('#sheetRoot form[data-form=lot]');
  await fill(p, { f_src: 'own' }); await fill(p, { f_var: 'برداشت آزمون', f_lqty: '40', f_lunit: 'کیلو' }); await submitForm(p); await settle(p);
  const lot = await p.evaluate(() => { const l = S.lots.find(x => !x.void && x.variety === 'برداشت آزمون'); return l && { id: l.id, src: l.source, qty: l.qty, rem: lotStat(l).rem }; });
  assert(lot && lot.src === 'own' && lot.qty === 40 && lot.rem === 40, 'harvest lot: ' + JSON.stringify(lot)); await inv('after the harvest');
  await openDoc(p, { type: 'invoice', personId: 'p_cu', date: '2026-10-10', led: 'receivable', items: [{ desc: 'عسل برداشت آزمون', qty: 15, unit: 'کیلو', price: 0.9e6, src: 'lot', lotId: lot.id }] });
  await submitForm(p); await settle(p);
  const s = await p.evaluate(id => { const l = byId('lots', id); const d = S.docs.find(x => !x.void && x.type === 'invoice' && x.personId === 'p_cu');
    return { rem: lotStat(l).rem, doc: !!d, owed: (personBal()['p_cu'] || {})['تومان'] || 0, total: d ? docTotal(d).total : 0, sales: S.moves.filter(m => !m.void && m.lotId === id && m.kind === 'sale').map(m => m.qty) }; }, lot.id);
  assert(s.doc && s.rem === 25 && JSON.stringify(s.sales) === '[15]', 'sale: ' + JSON.stringify(s));
  assert(s.owed === s.total && s.total === 13.5e6, `customer owes ${s.owed}, invoice total ${s.total}`); await inv('after the sale');
});

test('task paid with a voucher: «💳 ثبت پرداخت» opens a voucher for the task; saving it links the voucher and pays from the bank', async () => {
  await p.evaluate(async () => { const n = nowTs(); await putRaw('tasks', { id: 't_pay', title: 'پرداخت: تعمیر آزمون', due: today(), status: 'open', payAmt: 3e6, payKind: 'paid', created: n, updated: n }); render(); });
  const bank = () => p.evaluate(() => { const B = balancesByAcc(autoEntries(), 'تومان')['1101']; return B ? Math.round(B.dr - B.cr) : 0; });
  const b0 = await bank();
  await p.evaluate(() => { closeSheet(); const b = document.createElement('button'); b.dataset.act = 'taskPay'; b.dataset.id = 't_pay'; document.body.appendChild(b); b.click(); b.remove(); });
  await p.waitForSelector('#sheetRoot form[data-form=voucher]'); await submitForm(p); await settle(p);
  const r = await p.evaluate(() => ({ v: taskVchs('t_pay').map(v => vchAmt(v)), n: S.vouchers.filter(v => !v.void).length }));
  assert(JSON.stringify(r.v) === JSON.stringify([3e6]), 'voucher for the task: ' + JSON.stringify(r));
  assert((await bank()) === b0 - 3e6, `bank ${b0} → ${await bank()}`); await inv('after paying the task');
});

test('no page errors', async () => { assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
