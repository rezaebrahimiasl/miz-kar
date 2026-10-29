// Money forms that settle debts and clear cheques, through the real buttons and forms on synthetic records:
// exact ledger rows written, «settled» flags, cheque status, and the accounting invariants after each.
const { serve, launch, openApp, settle, invariants, fill, submitForm, test, run, assert } = require('./lib');
let srv, o, p;
const D0 = '2026-10-01';
const inv = async what => { const v = await invariants(p); assert(!v.length, `${what}: invariants broken: ${v.join('; ')}`); };
const open = (act, data) => p.evaluate(([act, data]) => { closeSheet(); const b = document.createElement('button'); b.dataset.act = act; Object.assign(b.dataset, data); b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); }, [act, data]);
const rows = () => p.evaluate(() => JSON.parse(JSON.stringify(S.ledger.filter(l => !l.void))));
const newRows = async (before) => (await rows()).filter(l => !before.some(b => b.id === l.id)).map(l => ({ kind: l.kind, amount: l.amount, personId: l.personId, refId: l.refId || '', acct: l.acct || '', instrument: l.instrument, settles: !!l.settles }));
const L = (id, extra) => ['ledger', { id, currency: 'تومان', date: D0, settled: false, void: false, instrument: 'نسیه', about: 'آزمون ' + id, category: 'فروش کالا', ...extra }];

test('setup: synthetic customer, supplier and bank account', async () => {
  srv = await serve(); o = await launch(); p = o.page; await openApp(o, srv.url);
  await p.evaluate(async rows => { const n = nowTs(); for (const [c, d] of rows) await putRaw(c, { created: n, updated: n, ...d }); render(); }, [
    ['people', { id: 'pc', name: 'مشتری آزمون' }], ['people', { id: 'ps', name: 'تأمین‌کنندهٔ آزمون' }],
    ['meta', { id: 'accts', a: { 'بانک الف': { open: 100e6, openDate: D0 } } }],
    L('r1', { kind: 'receivable', personId: 'pc', amount: 10e6, ref: 'F-1' }), L('r2', { kind: 'receivable', personId: 'pc', amount: 4e6, ref: 'F-2' }),
    L('r3', { kind: 'receivable', personId: 'pc', amount: 3e6, ref: 'F-3' }), L('y1', { kind: 'payable', personId: 'ps', amount: 6e6, ref: 'B-1', category: 'اجاره' }),
    ['cheques', { id: 'c1', dir: 'in', personId: 'pc', amount: 4e6, due: D0, no: '111', status: 'wait', linkId: 'r2', hist: [] }],
    ['cheques', { id: 'c2', dir: 'in', personId: 'pc', amount: 3e6, due: D0, no: '222', status: 'wait', linkId: 'r3', hist: [] }]]);
  await inv('fixtures');
});

test('settle: part, then the rest — one received row each, linked by refId; the receivable is settled only when fully paid', async () => {
  let b = await rows(); await open('settle', { id: 'r1' }); await p.waitForSelector('#sheetRoot form[data-form=settle]');
  await fill(p, { f_samt: '4', f_acct: 'بانک الف' }); await submitForm(p); await settle(p);
  let n = await newRows(b); const r1 = await p.evaluate(() => byId('ledger', 'r1').settled);
  assert(n.length === 1 && n[0].kind === 'received' && n[0].amount === 4e6 && n[0].refId === 'r1' && n[0].acct === 'بانک الف' && !r1, 'part: ' + JSON.stringify({ n, r1 }));
  b = await rows(); await open('settle', { id: 'r1' }); await p.waitForSelector('#sheetRoot form[data-form=settle]');
  await fill(p, { f_samt: '6', f_acct: 'بانک الف' }); await submitForm(p); await settle(p);
  n = await newRows(b); assert(n.length === 1 && n[0].amount === 6e6 && await p.evaluate(() => byId('ledger', 'r1').settled === true), 'rest: ' + JSON.stringify(n));
  await inv('after settle');
});

test('chqClear: clearing a cheque linked to a receivable writes one received row (cheque, bank), settles the receivable, marks the cheque cleared', async () => {
  const b = await rows(); await open('chqClear', { id: 'c1' }); await p.waitForSelector('#sheetRoot form[data-form=chqClear]');
  await fill(p, { f_acct: 'بانک الف' }); await submitForm(p); await settle(p);
  const n = await newRows(b); const c = await p.evaluate(() => byId('cheques', 'c1'));
  assert(n.length === 1 && n[0].kind === 'received' && n[0].amount === 4e6 && n[0].refId === 'r2' && n[0].instrument === 'چک' && n[0].acct === 'بانک الف', 'row: ' + JSON.stringify(n));
  assert(c.status === 'cleared' && c.ledgerId && await p.evaluate(() => byId('ledger', 'r2').settled === true), 'cheque/receivable: ' + JSON.stringify([c.status, c.ledgerId]));
  await inv('after chqClear');
});

test('chqEndorse: endorsing a received cheque to a supplier writes received + paid rows, settles both linked rows, marks it endorsed', async () => {
  const b = await rows(); await open('chqEndorse', { id: 'c2' }); await p.waitForSelector('#sheetRoot form[data-form=chqEndorse]');
  // the person and link pickers: choose values the way the pickers store them (select option or hidden input)
  await p.evaluate(() => { for (const [id, v] of [['f_person', 'ps'], ['f_clink2', 'y1']]) { const s = document.getElementById(id); if (!s) continue;
    if (s.tagName === 'SELECT' && ![...s.options].some(o => o.value === v)) s.add(new Option(v, v)); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); } });
  await submitForm(p); await settle(p);
  const n = (await newRows(b)).sort((a, c) => a.kind.localeCompare(c.kind)); const c = await p.evaluate(() => byId('cheques', 'c2'));
  assert(n.length === 2 && n[0].kind === 'paid' && n[0].personId === 'ps' && n[0].refId === 'y1' && n[1].kind === 'received' && n[1].personId === 'pc' && n[1].refId === 'r3' && n.every(x => x.amount === 3e6 && x.instrument === 'چک'), 'rows: ' + JSON.stringify(n));
  assert(c.status === 'endorsed' && c.endorseTo === 'ps' && await p.evaluate(() => byId('ledger', 'r3').settled === true), 'cheque: ' + JSON.stringify([c.status, c.endorseTo]));
  await inv('after chqEndorse');
});

test('settleall: «تسویهٔ همه» settles every open referenced payable of the person with one paid row for each remainder', async () => {
  await p.evaluate(async () => { const n = nowTs(); await putRaw('ledger', { id: 'y2', kind: 'payable', personId: 'ps', amount: 2e6, currency: 'تومان', date: '2026-10-02', settled: false, void: false, instrument: 'نسیه', about: 'آزمون y2', category: 'اجاره', ref: 'B-2', created: n, updated: n }); });
  const b = await rows(); await open('settleAll', { id: 'ps', v: 'payable' }); await p.waitForSelector('#sheetRoot form[data-form=settleall]');
  await fill(p, { f_acct: 'بانک الف' }); await submitForm(p); await settle(p);
  const n = await newRows(b); const st = await p.evaluate(() => ['y1', 'y2'].map(i => byId('ledger', i).settled));
  const got = n.map(x => [x.refId, x.amount, x.kind]).sort().join(';');   // y1 had 3 of 6 paid by the endorsed cheque → remainder 3; y2 → 2
  assert(got === 'y1,3000000,paid;y2,2000000,paid' && JSON.stringify(st) === '[true,true]', 'settleall: ' + JSON.stringify({ n, st }));
  await inv('after settleall');
});

test('no page errors', async () => { assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
