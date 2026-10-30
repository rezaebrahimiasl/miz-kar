// Information engine: qNorm (any object → clean query), qExec (query → plain data, read-only, deterministic), qHtml/aiRun
// («پرسش از داده‌ها»). The AI only proposes the query; the numbers come from qExec. Synthetic data only; Gemini is never reached.
const { serve, launch, openApp, test, run, assert } = require('./lib');
let srv, o, p;
const X = q => p.evaluate(q => JSON.parse(JSON.stringify(qExec(qNorm(q)))), q);

test('setup: synthetic people, two lots, sales in two months, a gift, ledger rows, tasks', async () => {
  srv = await serve(); o = await launch(); p = o.page; await openApp(o, srv.url);
  await p.evaluate(async () => { const b = { created: '2026-09-01T08:00:00.000Z', updated: '2026-09-01T08:00:00.000Z', void: false };
    for (const [id, name] of [['qa', 'مشتری یک آزمون'], ['qb', 'مشتری دو آزمون'], ['qs', 'تأمین‌کنندهٔ آزمون']]) await putRaw('people', { id, name, ...b });
    await putRaw('lots', { id: 'L1', product: 'عسل', variety: 'گون', unit: 'کیلو', qty: 50, cost: 0.5e6, source: 'buy', supplierId: 'qs', date: '2026-09-02', ...b });
    await putRaw('lots', { id: 'L2', product: 'عسل', variety: 'کنار', unit: 'کیلو', qty: 20, cost: 0.4e6, source: 'buy', supplierId: 'qs', date: '2026-10-02', ...b });
    const mv = (id, lotId, personId, qty, price, date, kind = 'sale') => putRaw('moves', { id, kind, lotId, personId, qty, price, currency: 'تومان', date, ...b });
    await mv('m1', 'L1', 'qa', 3, 0.8e6, '2026-09-10'); await mv('m2', 'L1', 'qb', 2, 0.9e6, '2026-10-05'); await mv('m3', 'L2', 'qa', 4, 0.7e6, '2026-10-06');
    await mv('m4', 'L1', 'qb', 1, 0, '2026-10-07', 'gift'); await putRaw('moves', { id: 'm5', kind: 'sale', lotId: 'L1', personId: 'qa', qty: 9, price: 1e6, date: '2026-10-08', ...b, void: true });
    const L = (id, kind, personId, amount, date, extra = {}) => putRaw('ledger', { id, kind, personId, amount, currency: 'تومان', date, settled: false, instrument: kind === 'receivable' || kind === 'payable' ? 'نسیه' : 'نقد/کارت', category: 'فروش کالا', about: 'آزمون ' + id, ...b, ...extra });
    await L('g1', 'receivable', 'qa', 5e6, '2026-09-20', { due: '2026-09-30' }); await L('g2', 'received', 'qa', 2e6, '2026-10-01', { refId: 'g1' });
    await L('g3', 'payable', 'qb', 1e6, '2026-10-02', { category: 'اجاره' }); await L('g4', 'receivable', 'qb', 3e6, '2026-10-03', { due: '2099-01-01' });
    await putRaw('tasks', { id: 'k1', title: 'کار دیرکرد آزمون', status: 'open', due: '2026-09-01', personId: 'qa', ...b });
    await putRaw('tasks', { id: 'k2', title: 'کار انجام‌شده آزمون', status: 'done', doneAt: '2026-10-04T09:00:00.000Z', due: '2026-10-04', ...b }); render(); });
});

test('qNorm: only known fields and values pass; Jalali dates become ISO; unreadable values are reported, never guessed', async () => {
  const r = await p.evaluate(() => [qNorm({ entity: 'sales', metric: 'sum', group: 'person', from: '1405/07/01', to: '۱۴۰۵/۰۷/۱۰', person: '  مشتری یک  ', delete: true, write: 'ledger', explain: 'x'.repeat(500) }),
    qNorm({ entity: 'drop table', metric: 'all', kind: 'x', status: 'y', group: 'z', from: 'دیروزِ پارسال' }), qNorm(null), qNorm('sales')]);
  const [a, b, c, d] = r;
  assert(a.entity === 'sales' && a.group === 'person' && a.from === '2026-09-23' && a.to === '2026-10-02' && a.person === 'مشتری یک' && a.explain.length === 200 && !('delete' in a) && !('write' in a) && !a.warn.length, 'clean: ' + JSON.stringify(a));
  assert(!b.entity && !b.metric && !b.kind && !b.status && !b.group && !b.from && b.warn.includes('entity') && b.warn.includes('from'), 'bad values: ' + JSON.stringify(b));
  assert(!c.entity && !d.entity && Array.isArray(c.warn), 'non-objects: ' + JSON.stringify([c, d]));
});

test('qExec sales/gifts: totals, quantities by unit, groups by person, product and month, date range, product filter; void moves left out', async () => {
  const s = await X({ entity: 'sales' });
  assert(s.kpi.count === 3 && s.kpi.amount === 3 * 0.8e6 + 2 * 0.9e6 + 4 * 0.7e6 && s.kpi.qty['کیلو'] === 9 && s.rows.length === 3 && s.rows[0].id === 'm3' && s.rows[0].col === 'moves', 'sales: ' + JSON.stringify(s.kpi));
  const byP = Object.fromEntries((await X({ entity: 'sales', group: 'person' })).groups.map(([k, v]) => [k, [v.q, v.v]]));
  assert(JSON.stringify(byP) === JSON.stringify({ 'مشتری یک آزمون': [7, 5.2e6], 'مشتری دو آزمون': [2, 1.8e6] }), 'by person: ' + JSON.stringify(byP));
  const byM = (await X({ entity: 'sales', group: 'month' })).groups.map(([k, v]) => [k, v.n]);
  assert(byM.length === 2 && byM.some(([k, n]) => k === '۱۴۰۵/۰۶' && n === 1) && byM.some(([k, n]) => k === '۱۴۰۵/۰۷' && n === 2), 'by month: ' + JSON.stringify(byM));
  const oct = await X({ entity: 'sales', from: '1405/07/09', to: '1405/07/15' });   // 2026-10-01 … 2026-10-07
  const kon = await X({ entity: 'sales', product: 'کنار' }), qa = await X({ entity: 'sales', person: 'مشتری یک آزمون' }), g = await X({ entity: 'gifts' });
  assert(oct.kpi.count === 2 && kon.kpi.count === 1 && kon.kpi.amount === 2.8e6 && qa.kpi.count === 2 && qa.pid === 'qa' && g.kpi.count === 1 && g.kpi.amount === 0, JSON.stringify({ oct: oct.kpi, kon: kon.kpi, qa: qa.kpi, g: g.kpi }));
});

test('qExec purchases, ledger, balance, overdue, tasks, stock: exact figures; every row points back to its record', async () => {
  const pu = await X({ entity: 'purchases' }), led = await X({ entity: 'ledger', kind: 'receivable' }), bal = await X({ entity: 'balance' }), od = await X({ entity: 'overdue' });
  const tl = await X({ entity: 'tasks', status: 'late' }), td = await X({ entity: 'tasks', status: 'done' }), st = await X({ entity: 'stock' });
  assert(pu.kpi.count === 2 && pu.kpi.amount === 50 * 0.5e6 + 20 * 0.4e6 && pu.rows.every(r => r.col === 'lots'), 'purchases: ' + JSON.stringify(pu.kpi));
  assert(led.kpi.count === 2 && led.kpi.sum === 8e6 && led.rows.map(r => r.id).sort().join() === 'g1,g4', 'ledger: ' + JSON.stringify(led.kpi));
  const B = Object.fromEntries(bal.rows.map(r => [r.pid, r.amount]));
  const want = await p.evaluate(() => Object.fromEntries(Object.entries(personBal()).map(([k, m]) => [k, m['تومان'] || 0]).filter(([, v]) => Math.abs(v) >= 1)));
  assert(JSON.stringify(B) === JSON.stringify(want) && B.qa === 3e6, 'balance must equal personBal(): ' + JSON.stringify([B, want]));
  assert(od.rows.length === 1 && od.rows[0].id === 'g1' && od.rows[0].amount === 3e6, 'overdue: ' + JSON.stringify(od.rows));
  assert(tl.rows.map(r => r.id).join() === 'k1' && td.rows.map(r => r.id).join() === 'k2', 'tasks: ' + JSON.stringify([tl.rows, td.rows]));
  const S1 = Object.fromEntries(st.rows.map(r => [r.id, r.qty])); assert(S1.L1 === 44 && S1.L2 === 16, 'stock: ' + JSON.stringify(S1));
});

test('a person who is not in «افراد» matches nothing (it used to fall back to everyone); unknown entity → unsupported', async () => {
  for (const entity of ['sales', 'purchases', 'ledger', 'balance', 'overdue', 'tasks']) {
    const r = await X({ entity, person: 'کسی که نیست' });
    assert(r.noPerson && !r.rows.length && !(r.kpi.count || r.kpi.sum || r.kpi.amount), `${entity}: ` + JSON.stringify(r.kpi));
  }
  const h = await p.evaluate(() => aiRun({ entity: 'sales', person: 'کسی که نیست', explain: 'فروش' }));
  assert(h.includes('در افراد پیدا نشد') && h.includes('<div class="v">۰</div>'), 'page: ' + h.slice(0, 300));
  const u = await X({ entity: 'weather' }); assert(u.unsupported, 'unsupported: ' + JSON.stringify(u));
});

test('read-only and deterministic: many queries change nothing and give the same answer twice', async () => {
  const before = await p.evaluate(() => [JSON.stringify(COLS.map(c => S[c])), window._dv]);
  const qs = ['sales', 'gifts', 'purchases', 'ledger', 'balance', 'overdue', 'tasks', 'stock', 'x'].flatMap(e => [{ entity: e }, { entity: e, group: 'person' }, { entity: e, person: 'مشتری دو آزمون' }]);
  const a = await p.evaluate(qs => qs.map(q => JSON.stringify(qExec(qNorm(q)))), qs), b = await p.evaluate(qs => qs.map(q => JSON.stringify(qExec(qNorm(q)))), qs);
  const after = await p.evaluate(() => [JSON.stringify(COLS.map(c => S[c])), window._dv]);
  assert(JSON.stringify(a) === JSON.stringify(b), 'not deterministic');
  assert(before[0] === after[0] && before[1] === after[1], 'a query changed data');
});

test('«پرسش از داده‌ها»: whatever the AI returns (extra fields, an unknown entity) only becomes a query; the answer comes from the engine; nothing is written', async () => {
  const r = await p.evaluate(async () => { const v0 = window._dv; localStorage.setItem('miz.ai', JSON.stringify({ key: 'SYNTHETIC-NOT-A-KEY', on: true }));
    const real = aiCall; const out = [];
    for (const reply of [{ entity: 'sales', group: 'person', explain: 'فروش به تفکیک طرف', delete: 'all', amount: 999e6 }, { entity: 'transfer_money', explain: 'x' }]) {
      window.aiCall = async () => reply; await aiAsk('پرسش آزمون'); out.push(document.getElementById('aiAns').innerHTML); }
    window.aiCall = real; localStorage.removeItem('miz.ai'); closeSheet(); return { out, same: window._dv === v0 }; });
  assert(r.out[0].includes('مشتری یک آزمون') && r.out[0].includes('فروش به تفکیک طرف') && !r.out[0].includes('۹۹۹'), 'answer: ' + r.out[0].slice(0, 300));
  assert(r.out[1].includes('هنوز نمی‌توانم') && r.same, 'unknown: ' + JSON.stringify([r.out[1].slice(-120), r.same]));
});

test('no page errors, nothing sent', async () => { assert(!o.errors.length, o.errors.join(' | ')); assert(!o.net.external.length, o.net.external.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
