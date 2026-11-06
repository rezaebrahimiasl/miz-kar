// Calculation rules without a direct test before 4.47 (docs/kb/CALCULATION_RULES.md §10): recurring dates (recurNext),
// due ageing (agingHtml buckets; no due date = date + 30 days), suspect settled state (ledSuspect), due list (dueLedger).
// Pure reads on synthetic data; the page clock is fixed so the results do not depend on the day the test runs.
const { serve, launch, openApp, settle, test, run, assert } = require('./lib');
let srv, o, p;
test('setup', async () => { srv = await serve(); o = await launch(); await o.page.clock.install({ time: new Date('2026-11-11T09:00:00') }); await o.page.clock.resume(); await openApp(o, srv.url); p = o.page; });

test('recurNext: monthly day 31 falls on the last day of a 30-day month; yearly moves to next year; weekly keeps the weekday', async () => {
  const r = await p.evaluate(() => {
    const m1 = recurNext({ per: 'monthly', day: 31 }, jIso(1405, 7, 1)), m2 = recurNext({ per: 'monthly', day: 31 }, jIso(1405, 1, 1));
    const y = recurNext({ per: 'yearly', mon: 1, day: 1 }, jIso(1405, 1, 1)), d = recurNext({ per: 'daily' }, jIso(1405, 7, 1));
    const w0 = jIso(1405, 8, 20), wd = (wdOf(w0) + 3) % 7, w = recurNext({ per: 'weekly', wd }, w0);
    return { m1, e1: jIso(1405, 7, 30), m2, e2: jIso(1405, 1, 31), y, ey: jIso(1406, 1, 1), d, ed: addDays(jIso(1405, 7, 1), 1), w, wd, wdw: wdOf(w), gap: diffDays(w, w0) };
  });
  assert(r.m1 === r.e1 && r.m2 === r.e2, 'monthly: ' + JSON.stringify(r));
  assert(r.y === r.ey && r.d === r.ed, 'yearly/daily: ' + JSON.stringify(r));
  assert(r.wdw === r.wd && Math.abs(r.gap) >= 1 && Math.abs(r.gap) <= 7, 'weekly: ' + JSON.stringify(r));
});

test('ageing buckets, due list and suspect settled rows', async () => {
  await p.evaluate(async () => { const n = nowTs(), t = today(); await putRaw('people', { id: 'pa', name: 'شخص سنی', created: n, updated: n });
    const R = (id, o) => putRaw('ledger', { id, kind: 'receivable', personId: 'pa', currency: 'تومان', about: 'آزمون', settled: false, void: false, created: n, updated: n, ...o });
    await R('a1', { amount: 1e6, date: addDays(t, -10), due: addDays(t, 5) });      // not due
    await R('a2', { amount: 2e6, date: addDays(t, -50), due: addDays(t, -45) });    // 31–60
    await R('a3', { amount: 3e6, date: addDays(t, -100) });                          // no due → date + 30 → 70 days late → 61–90
    await R('s1', { amount: 4e6, date: addDays(t, -5), settled: true });              // settled, nothing paid → less
    await R('s2', { amount: 5e6, date: addDays(t, -5) });                             // fully paid but not settled → open
    await putRaw('ledger', { id: 's2p', kind: 'received', personId: 'pa', refId: 's2', amount: 5e6, currency: 'تومان', date: addDays(t, -2), about: 'دریافت', settled: false, void: false, created: n, updated: n }); });
  await p.reload(); await settle(p);
  const r = await p.evaluate(() => {
    const box = document.createElement('div'); box.innerHTML = agingHtml(); const row = [...box.querySelectorAll('tr')].find(tr => /شخص سنی/.test(tr.textContent));
    const cells = row ? [...row.querySelectorAll('td')].map(td => td.textContent.trim()) : [];
    const sus = Object.fromEntries(ledSuspect('pa').map(x => [x.l.id, x.why]));
    const due = dueLedger(7).filter(l => l.personId === 'pa').map(l => l.id).sort();
    return { cells, sus, due, M: [money(1e6), money(2e6), money(3e6)] };
  });
  assert(r.cells.length >= 6, 'ageing row: ' + JSON.stringify(r));
  const [, b0, b1, b2, b3, b4] = r.cells;
  assert(b0 === r.M[0] && b2 === r.M[1] && b3 === r.M[2] && !/[1-9۱-۹]/.test(b1) && !/[1-9۱-۹]/.test(b4), 'buckets: ' + JSON.stringify(r));
  assert(r.sus.s1 === 'less' && r.sus.s2 === 'open' && !r.sus.a1, 'suspect: ' + JSON.stringify(r.sus));
  assert(JSON.stringify(r.due) === JSON.stringify(['a1', 'a2']), 'due list (rows with a due date ≤ today+7 and open > 0.5; a row without a due date is not listed): ' + JSON.stringify(r.due));
});

test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
