// Final fixes on 2a246d1: the management calendar lists each item once (a past item whose date is in view is not repeated in
// «نیاز به توجه»); numbers in the calendar, the Today banner and the person timeline are not next to «·» (it reads like «۰»);
// confPick reads the conflict list inside its operation, so a conflict added while snapTake() runs is not overwritten. Synthetic.
const { serve, launch, openApp, settle, invariants, test, run, assert } = require('./lib');
let srv, o, p;
const disk = k => p.evaluate(k => new Promise(r => { const q = idb.transaction('docs').objectStore('docs').get(k); q.onsuccess = () => r(q.result ? q.result.doc : null); }), k);
const NUMDOT = /[·]\s*[۰-۹0-9]|[۰-۹0-9]\s*[·]/;
// TEST-67: the clock starts on a fixed Wednesday mid-month (then runs normally), so «today + 1» and the week start stay in the same Persian week and month.
test('setup', async () => { srv = await serve(); o = await launch(); await o.page.clock.install({ time: new Date('2026-11-11T09:00:00') }); await o.page.clock.resume(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs(), t = today(), wk = addDays(t, -((wdOf(t) + 1) % 7));
    await putRaw('people', { id: 'p_c', name: 'شخص تقویم', created: n, updated: n });
    // past but inside this week (if today is not the first day of the week), past and before this week, undated
    await putRaw('tasks', { id: 't_inweek', title: 'گذشتهٔ همین هفته', due: wk < t ? wk : addDays(t, -1), status: 'open', created: n, updated: n });
    await putRaw('tasks', { id: 't_old', title: 'گذشتهٔ قدیمی', due: addDays(wk, -10), status: 'open', created: n, updated: n });
    await putRaw('tasks', { id: 't_nodate', title: 'بی‌تاریخ', status: 'open', created: n, updated: n });
    await putRaw('ledger', { id: 'l_c', kind: 'receivable', personId: 'p_c', amount: 50e6, currency: 'تومان', date: addDays(t, -20), due: addDays(t, 1), instrument: 'نسیه', created: n, updated: n }); });
  await p.reload(); await settle(p); });

test('calendar: every item appears exactly once in day, week and month views', async () => {
  for (const v of ['day', 'week', 'month']) {
    const r = await p.evaluate(v => { closeSheet(); mcal(v, today(), ''); const refs = [...document.querySelectorAll('#sheetRoot [data-mcal] .row')].map(x => (x.querySelector('[data-act]') || {}).dataset).map(d => d && d.act + ':' + d.id);
      return { refs, inweek: (byId('tasks', 't_inweek') || {}).due }; }, v);
    const dup = r.refs.filter((x, i) => r.refs.indexOf(x) !== i); assert(!dup.length, `${v}: duplicated items ${JSON.stringify(dup)}`);
    assert(r.refs.includes('editTask:t_old') && r.refs.includes('editTask:t_nodate'), `${v}: overdue/undated item missing: ${JSON.stringify(r.refs)}`);
  }
  const wk = await p.evaluate(() => { closeSheet(); mcal('week', today(), ''); const att = [...document.querySelectorAll('#sheetRoot [data-mcal] .blk, #sheetRoot [data-mcal] details, #sheetRoot [data-mcal] section')].length; return document.querySelector('#sheetRoot [data-mcal]').textContent.split('گذشتهٔ همین هفته').length - 1; });
  assert(wk === 1, 'past item of this week shown ' + wk + ' times in the week view');
});

test('no «·» next to a number in the calendar, the Today banner and the person timeline', async () => {
  const r = await p.evaluate(() => { closeSheet(); mcal('week', today(), ''); const a = document.querySelector('#sheetRoot [data-mcal]').textContent; closeSheet(); pTimelineSheet('p_c'); const b = document.querySelector('#sheetRoot [data-ptl]').textContent;
    closeSheet(); tab = 'today'; render(); const c = (document.querySelector('[data-act=mcal][data-v=day]') || {}).textContent || ''; return { a, b, c }; });
  for (const [k, t] of Object.entries(r)) assert(t && !NUMDOT.test(t), `${k}: «·» next to a number: ` + (t.match(/.{0,20}·.{0,20}/) || [''])[0]);
  assert(/، ۵۰/.test(r.a) || /،\s*[۰-۹]/.test(r.a), 'calendar amount separator: ' + r.a.slice(0, 200));
});

test('confPick: a conflict added while snapTake() runs (e.g. by a sync) survives; the chosen one is closed; memory = disk', async () => {
  const r = await p.evaluate(async () => { const t = nowTs(); const base = byId('people', 'p_c');
    await putRaw('meta', { id: 'conflicts', list: [{ key: 'people/p_c', col: 'people', id: 'p_c', local: base, remote: { ...base, name: 'نسخهٔ دیگر' }, at: t, open: true }], created: t, updated: t });
    const real = window.snapTake;
    window.snapTake = async (...a) => { const x = await real(...a); await confSave([{ key: 'tasks/t_old', col: 'tasks', id: 't_old', local: byId('tasks', 't_old'), remote: { ...byId('tasks', 't_old'), title: 'دور' }, at: nowTs(), open: true }, ...CONF()]); return x; };
    await confPick('people/p_c', 'remote'); window.snapTake = real;
    const L = CONF(); return { keys: L.map(x => x.key + ':' + (x.open ? 'open' : 'closed')), name: byId('people', 'p_c').name }; });
  const d = await disk('meta/conflicts'); const dk = (d.list || []).map(x => x.key + ':' + (x.open ? 'open' : 'closed'));
  assert(r.keys.includes('tasks/t_old:open') && r.keys.includes('people/p_c:closed') && r.name === 'نسخهٔ دیگر', 'memory: ' + JSON.stringify(r));
  assert(JSON.stringify(dk.sort()) === JSON.stringify(r.keys.slice().sort()), 'disk differs: ' + JSON.stringify(dk));
  const v = await invariants(p); assert(!v.length, v.join('; ')); assert(!o.errors.length, o.errors.join(' | '));
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
