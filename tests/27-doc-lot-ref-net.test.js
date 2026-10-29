// WP-10 (first group): the submit branches «net» (net profit), «refsale» (referral sale and its edit), «lot» (stock lots)
// and «doc» (documents without posting), through the real forms on synthetic records: exact ledger rows and the
// accounting/inventory invariants after each. Sales and purchases through «doc» are covered by 20, 30 and 50.
const { serve, launch, openApp, settle, invariants, fill, submitForm, openDoc, submit, test, run, assert } = require('./lib');
let srv, o, p;
const D0 = '2026-10-01';
const inv = async what => { const v = await invariants(p); assert(!v.length, `${what}: invariants broken: ${v.join('; ')}`); };
const rows = () => p.evaluate(() => JSON.parse(JSON.stringify(S.ledger.filter(l => !l.void))));
const added = async b => (await rows()).filter(l => !b.some(x => x.id === l.id));
// set pickers/selects the way they store values (select option or hidden input)
const pick = vals => p.evaluate(vals => { for (const [id, v] of Object.entries(vals)) { const s = document.getElementById(id); if (!s) throw new Error('no field ' + id);
  if (s.tagName === 'SELECT' && ![...s.options].some(o => o.value === v)) s.add(new Option(v, v)); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); } }, vals);
const form = async (fn, sel) => { await p.evaluate(fn); await p.waitForSelector(`#sheetRoot form[data-form=${sel}]`); };

test('setup: synthetic people and one bank account', async () => {
  srv = await serve(); o = await launch(); p = o.page; await openApp(o, srv.url);
  await p.evaluate(async D0 => { const n = nowTs(), b = { created: n, updated: n };
    for (const [id, name] of [['pa', 'مشتری آزمون'], ['pd', 'همکار ارسال آزمون'], ['pm', 'بازاریاب آزمون'], ['ps', 'تأمین‌کنندهٔ آزمون'], ['pq', 'طلبکار آزمون']]) await putRaw('people', { id, name, ...b });
    await putRaw('meta', { id: 'accts', a: { 'بانک الف': { open: 100e6, openDate: '2026-09-01' } }, ...b });
    await putRaw('ledger', { id: 'debt1', kind: 'payable', personId: 'pq', amount: 5e6, currency: 'تومان', about: 'بدهی آزمون', category: 'اجاره', instrument: 'نسیه', date: D0, settled: false, void: false, ...b }); render(); }, D0);
  await inv('fixtures');
});

test('net: «in» (bank), «due» (receivable in 30 days), «debt» (pays a creditor), «asset» (investment) and a cost row — exact rows', async () => {
  const cases = [
    [{ f_nam: '2', f_nst: 'in' }, { f_acct: 'بانک الف', f_person: 'pa' }, r => r.length === 1 && r[0].kind === 'received' && r[0].amount === 2e6 && r[0].acct === 'بانک الف' && r[0].net === true],
    [{ f_nam: '3', f_nst: 'due' }, { f_person: 'pa' }, r => r.length === 1 && r[0].kind === 'receivable' && r[0].amount === 3e6 && !!r[0].due],
    [{ f_nam: '4', f_nst: 'debt' }, { f_nto: 'pq' }, r => r.length === 2 && r.some(x => x.kind === 'received' && x.amount === 4e6) && r.some(x => x.kind === 'paid' && x.personId === 'pq' && x.settles === true && x.netOf)],
    [{ f_nam: '1.5', f_nst: 'asset', f_nasset: 'سکهٔ آزمون' }, {}, r => r.length === 2 && r.some(x => x.kind === 'paid' && x.amount === 1.5e6 && x.about === 'خرید: سکهٔ آزمون' && x.netOf)],
    [{ f_nam: '5', f_nst: 'in', f_ncost: '1' }, { f_acct: 'بانک الف' }, r => r.length === 2 && r.some(x => x.kind === 'paid' && x.amount === 1e6 && x.netOf)]];
  for (const [fields, picks, ok] of cases) {
    const b = await rows(); await form(() => { closeSheet(); formNet(); }, 'net');
    await fill(p, { f_nst: fields.f_nst }); await fill(p, fields); await pick(picks); await submitForm(p); await settle(p);
    const r = await added(b); assert(ok(r), `net ${fields.f_nst}: ` + JSON.stringify(r.map(x => [x.kind, x.amount, x.personId, x.acct, x.settles, x.about])));
    await inv('after net ' + fields.f_nst);
  }
});

test('refsale: new referral sale → commission receivable from the sender and marketer payable; editing it carries a partial payment over', async () => {
  let b = await rows(); await form(() => { closeSheet(); formRef({}); }, 'refsale');
  await pick({ f_rdisp: 'pd', f_rcust: 'pa', f_rmkt: 'pm' }); await fill(p, { f_ramt: '100', f_rrate: '5', f_rmp: '2' }); await submitForm(p); await settle(p);   // the marketer is chosen first: choosing fills in their usual share
  let r = await added(b); const rc = r.find(x => x.kind === 'receivable'), py = r.find(x => x.kind === 'payable');
  const share = await p.evaluate(() => Math.round(mshare(100e6, 5, 2)));
  const tt = await p.evaluate(() => document.getElementById('toast').textContent + ' / form open: ' + !!document.querySelector('#sheetRoot form[data-form=refsale]'));
  assert(r.length === 2 && rc && rc.personId === 'pd' && rc.amount === 5e6 && py && py.personId === 'pm' && py.amount === share && rc.ref && rc.ref.id, 'new: ' + JSON.stringify(r.map(x => [x.kind, x.personId, x.amount])) + ' · ' + tt);
  await inv('after refsale');
  // the sender pays 2 of the 5 (a received row linked by refId); then the sale is edited to 6 %
  await p.evaluate(async ([id, D0]) => { const n = nowTs(); await putRaw('ledger', { id: 'rp1', kind: 'received', personId: 'pd', amount: 2e6, currency: 'تومان', acct: 'بانک الف', about: 'دریافت پورسانت', refId: id, instrument: 'نقد/کارت', date: D0, settled: false, void: false, created: n, updated: n }); }, [rc.id, D0]);
  b = await rows(); await p.evaluate(rid => { closeSheet(); const x = document.createElement('button'); x.dataset.act = 'refEdit'; x.dataset.id = rid; x.hidden = true; document.body.appendChild(x); x.click(); x.remove(); }, rc.ref.id);
  await p.waitForSelector('#sheetRoot form[data-form=refsale]'); await fill(p, { f_rrate: '6' }); await submitForm(p); await settle(p);
  r = await added(b); const nrc = r.find(x => x.kind === 'receivable');
  const s = await p.evaluate(([old, nid]) => ({ oldVoid: !!byId('ledger', old).void, pay: byId('ledger', 'rp1').refId, live: S.ledger.filter(l => !l.void && l.ref && l.kind === 'receivable').length, amt: (byId('ledger', nid) || {}).amount }), [rc.id, nrc && nrc.id]);
  assert(nrc && s.oldVoid && s.pay === nrc.id && s.live === 1 && s.amt === 6e6, 'edit: ' + JSON.stringify(s));
  await inv('after refsale edit');
});

test('lot: opening stock (no money row), consigned goods (payable to the owner), and editing a bought lot updates its purchase row with history', async () => {
  let b = await rows(); await form(() => { closeSheet(); formLot(); }, 'lot');
  await fill(p, { f_src: 'open' }); await fill(p, { f_var: 'موجودی اول آزمون', f_lqty: '20', f_lunit: 'کیلو', f_lopen: '0.5' }); await submitForm(p); await settle(p);
  let L = await p.evaluate(() => { const l = S.lots.find(x => !x.void && x.variety === 'موجودی اول آزمون'); return l && { src: l.source, qty: l.qty, cost: l.cost }; });
  assert(L && L.src === 'open' && L.qty === 20 && L.cost === 0.5e6 && !(await added(b)).length, 'open lot: ' + JSON.stringify(L)); await inv('after open lot');
  b = await rows(); await form(() => { closeSheet(); formLot(); }, 'lot');
  await fill(p, { f_src: 'consign' }); await pick({ f_sup: 'ps' }); await fill(p, { f_var: 'امانی آزمون', f_lqty: '10', f_lunit: 'کیلو', f_lcost: '0.8' }); await submitForm(p); await settle(p);
  let r = await added(b); L = await p.evaluate(() => { const l = S.lots.find(x => !x.void && x.variety === 'امانی آزمون'); return l && { id: l.id, consign: l.consign, src: l.source, code: l.code }; });
  assert(L && L.consign && L.src === 'buy' && r.length === 1 && r[0].kind === 'payable' && r[0].personId === 'ps' && r[0].amount === 8e6 && r[0].lotId === L.id, 'consign: ' + JSON.stringify({ L, r: r.map(x => [x.kind, x.amount, x.personId]) }));
  await inv('after consign lot');
  // edit: 10 → 12 kg at the same cost; the purchase row follows (8 → 9.6) and keeps a history entry
  await p.evaluate(id => { closeSheet(); formLot(byId('lots', id)); }, L.id); await p.waitForSelector('#sheetRoot form[data-form=lot]');
  await fill(p, { f_lqty: '12' }); await submitForm(p); await settle(p);
  const e = await p.evaluate(([lid, rid]) => { const g = byId('ledger', rid); return { qty: byId('lots', lid).qty, amount: g.amount, hist: (g.hist || []).map(h => [h.from, h.to]) }; }, [L.id, r[0].id]);
  assert(e.qty === 12 && e.amount === 9.6e6 && JSON.stringify(e.hist) === JSON.stringify([[8e6, 9.6e6]]), 'edit: ' + JSON.stringify(e));
  await inv('after lot edit');
});

test('doc: a pro-forma and a letter are saved without any stock or money rows', async () => {
  const b = await rows(), m0 = await p.evaluate(() => S.moves.length + S.lots.length);
  await openDoc(p, { type: 'proforma', personId: 'pa', date: D0, items: [{ desc: 'عسل پیش‌فاکتور آزمون', qty: 5, unit: 'کیلو', price: 1e6 }] }); await submit(p); await settle(p);
  await openDoc(p, { type: 'letter', toName: 'گیرندهٔ آزمون', subject: 'نامهٔ آزمون WP-10', date: D0, body: 'متن' }); await submit(p); await settle(p);
  const d = await p.evaluate(() => S.docs.filter(x => !x.void && (x.type === 'proforma' || x.type === 'letter')).map(x => x.type).sort());
  assert(JSON.stringify(d) === '["letter","proforma"]' && !(await added(b)).length && (await p.evaluate(() => S.moves.length + S.lots.length)) === m0, 'docs: ' + JSON.stringify(d));
  await inv('after pro-forma and letter');
});

test('no page errors', async () => { assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
