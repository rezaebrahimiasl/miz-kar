// Unified management calendar (mcal/mcItems): tasks, appointments (with time ranges), receivables due and stock exceptions in one
// view; overdue/undated in «نیاز به توجه»; filters; each item opens its own record; done/postpone on tasks; no duplicates;
// day/week/month; Today page entry. Read-only over existing records. Synthetic data only.
const { serve, launch, openApp, settle, invariants, test, run, assert } = require('./lib');
let srv, o, p;
const txt = () => p.evaluate(() => document.querySelector('#sheetRoot [data-mcal]').textContent);
test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs(), t = today();
    await putRaw('people', { id: 'p_m', name: 'شخص تقویم', created: n, updated: n }); await putRaw('cases', { id: 'c_m', code: 'SYN-M', personId: 'p_m', status: 'open', created: n, updated: n });
    await putRaw('tasks', { id: 't_a', title: 'نوبت تقویم', due: t, time: '10:00', dur: 45, caseId: 'c_m', status: 'open', created: n, updated: n });
    await putRaw('tasks', { id: 't_b', title: 'کار تقویم', due: t, time: '12:00', status: 'open', created: n, updated: n });
    await putRaw('tasks', { id: 't_late', title: 'کار عقب‌افتاده', due: addDays(t, -3), status: 'open', created: n, updated: n });
    await putRaw('tasks', { id: 't_nod', title: 'کار بی‌تاریخ', status: 'open', created: n, updated: n });
    await putRaw('ledger', { id: 'l_r', kind: 'receivable', personId: 'p_m', amount: 5e6, currency: 'تومان', date: addDays(t, -10), due: addDays(t, 2), about: 'آزمون', created: n, updated: n }); });
  await p.reload(); await settle(p); });
test('day/week/month, ranges, attention section, filters, no duplicates, today entry', async () => {
  const M = await p.evaluate(() => mcItems().map(x => x.k)); assert(new Set(M).size === M.length && M.includes('tasks/t_a') && M.includes('ledger/l_r'), 'items: ' + JSON.stringify(M));
  await p.evaluate(() => { closeSheet(); tab = 'today'; render(); }); await settle(p); await p.click('[data-act=mcal][data-v=day]'); await settle(p);
  let t = await txt(); assert(t.includes('۱۰:۰۰–۱۰:۴۵') && t.includes('کار تقویم') && t.includes('کار عقب‌افتاده') && t.includes('کار بی‌تاریخ') && !t.includes('دریافتنی'), 'day: ' + t.slice(0, 400));
  await p.click('#sheetRoot [data-act=mcal][data-v=week]'); await settle(p); t = await txt(); assert(t.includes('دریافتنی از شخص تقویم'), 'week lacks the receivable due');
  await p.click('#sheetRoot [data-act=mcalF][data-v=fin]'); await settle(p); t = await txt(); assert(t.includes('دریافتنی') && !t.includes('کار تقویم'), 'finance filter');
  await p.click('#sheetRoot [data-act=mcalF][data-v=""]'); await p.click('#sheetRoot [data-act=mcal][data-v=month]'); await settle(p); t = await txt(); assert(t.includes('کار تقویم') && t.includes('دریافتنی'), 'month: ' + JSON.stringify(await p.evaluate(() => [ui.mcV, ui.mcD, ui.mcF])) + t.replace(/\s+/g, ' ').slice(0, 600));
});
test('items open their own records; done and postpone act on the task itself', async () => {
  await p.evaluate(() => mcal('day', today(), '')); await p.click('#sheetRoot [data-mcal] [data-act=viewLedger][data-id=l_r]').catch(() => {});
  await p.evaluate(() => mcal('week', today(), '')); await p.click('#sheetRoot [data-mcal] [data-act=viewLedger][data-id=l_r]'); await settle(p);
  assert(!(await p.$('#sheetRoot [data-mcal]')), 'receivable did not open its record');
  await p.evaluate(() => mcal('day', today(), '')); await p.click('#sheetRoot [data-act=mcTask][data-id=t_b][data-v=done]'); await settle(p);
  await p.click('#sheetRoot [data-act=mcTask][data-id=t_late][data-v="1"]'); await settle(p);
  const r = await p.evaluate(() => [byId('tasks', 't_b').status, byId('tasks', 't_late').due === addDays(today(), 1), S.tasks.length]);
  assert(r[0] === 'done' && r[1] && r[2] === 4, 'actions: ' + JSON.stringify(r));
  const v = await invariants(p); assert(!v.length, v.join('; ')); assert(!o.errors.length, o.errors.join(' | '));
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
