// personTimeline: read-only history from records linked by personId (ledger, docs, cases/visits/appointments); sorted, no
// duplicates, each entry references its own record; clinical entries only with clinical=true and without clinical content;
// books unchanged. Synthetic data only.
const { serve, launch, openApp, settle, invariants, test, run, assert } = require('./lib');
let srv, o, p;
test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs();
    await putRaw('people', { id: 'p_t', name: 'شخص تاریخچه', created: n, updated: n }); await putRaw('people', { id: 'p_x', name: 'دیگری', created: n, updated: n });
    await putRaw('ledger', { id: 'l1', kind: 'receivable', personId: 'p_t', amount: 2e6, currency: 'تومان', date: '2026-09-01', created: n, updated: n });
    await putRaw('ledger', { id: 'l2', kind: 'received', personId: 'p_t', amount: 1e6, currency: 'تومان', date: '2026-10-01', created: n, updated: n });
    await putRaw('ledger', { id: 'l3', kind: 'paid', personId: 'p_x', amount: 5e6, currency: 'تومان', date: '2026-10-02', created: n, updated: n });
    await putRaw('cases', { id: 'c_t', code: 'SYN-T', personId: 'p_t', status: 'open', created: '2026-08-01T00:00:00Z', updated: n });
    await putRaw('visits', { id: 'v1', caseId: 'c_t', no: 1, date: '2026-09-15', obs: 'محرمانهٔ بالینی', created: n, updated: n });
    await putRaw('tasks', { id: 't1', title: 'ویزیت SYN-T', due: '2026-10-20', time: '10:00', caseId: 'c_t', status: 'open', created: n, updated: n }); });
  await p.reload(); await settle(p); });
test('collects, orders, no duplicates, references, privacy', async () => {
  const r = await p.evaluate(() => { const a = personTimeline('p_t'), b = personTimeline('p_t', false); return { a: a.map(e => [e.col + '/' + e.id, e.date, e.mod]), b: b.map(e => e.col), txt: JSON.stringify(a) }; });
  const refs = r.a.map(x => x[0]);
  assert(['ledger/l1', 'ledger/l2', 'visits/v1', 'tasks/t1', 'cases/c_t'].every(k => refs.includes(k)) && !refs.includes('ledger/l3'), 'collected: ' + JSON.stringify(refs));
  assert(new Set(refs).size === refs.length, 'duplicates');
  const d = r.a.map(x => x[1]); assert(d.every((x, i) => i === 0 || (d[i - 1] || '0') >= (x || '0')), 'order: ' + JSON.stringify(d));
  assert(!r.b.some(c => ['visits', 'tasks', 'cases'].includes(c)) && !r.txt.includes('محرمانهٔ بالینی'), 'privacy: ' + JSON.stringify(r.b));
  const bal0 = await p.evaluate(() => JSON.stringify(personBal()));
  await p.evaluate(() => { closeSheet(); viewPerson('p_t'); }); await settle(p); await p.click('#sheetRoot [data-act=pTimeline]'); await settle(p);
  assert(await p.$('#sheetRoot [data-ptl] [data-ref="ledger/l1"][data-act=viewLedger][data-id=l1]'), 'entry does not open its record');
  await p.click('#sheetRoot [data-ptl] [data-act=viewLedger][data-id=l1]'); await settle(p); assert(!(await p.$('#sheetRoot [data-ptl]')), 'record did not open');
  assert((await p.evaluate(() => JSON.stringify(personBal()))) === bal0, 'balances changed');
  const v = await invariants(p); assert(!v.length, v.join('; ')); assert(!o.errors.length, o.errors.join(' | '));
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
