// visit.apptId: a visit points to the exact appointment it completed (unique match or explicit choice); an appointment a visit
// points to cannot be deleted for good (cancel instead); unlinked ones still can; older visits without apptId keep working. Synthetic.
const { serve, launch, openApp, settle, invariants, submitForm, test, run, assert } = require('./lib');
let srv, o, p;
test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs(); await putRaw('people', { id: 'p_l', name: 'مراجع پیوند', created: n, updated: n });
    await putRaw('cases', { id: 'c_l', code: 'SYN-L', personId: 'p_l', status: 'open', created: n, updated: n });
    await putRaw('visits', { id: 'v_old', caseId: 'c_l', no: 1, date: addDays(today(), -20), obs: 'ویزیت قدیمی بدون پیوند', created: n, updated: n });
    await putRaw('tasks', { id: 't_one', title: 'ویزیت SYN-L', due: today(), time: '10:00', caseId: 'c_l', status: 'open', area: 'therapy', created: n, updated: n });
    await putRaw('tasks', { id: 't_free', title: 'کار بی‌ربط', due: today(), status: 'open', created: n, updated: n }); });
  await p.reload(); await settle(p); });

test('a unique open appointment is linked exactly; the older visit without apptId still shows and counts', async () => {
  await p.evaluate(() => { closeSheet(); formVisit('c_l'); }); await p.waitForSelector('#sheetRoot form[data-form=visit]');
  assert((await p.$eval('#f_vap', e => e.value)) === 't_one', 'unique appointment not preselected');
  await p.evaluate(() => { const e = document.getElementById('f_vn'); if (!e) return; e.value = 'جلسهٔ پیوند'; e.dispatchEvent(new Event('input', { bubbles: true })); }); await submitForm(p); await settle(p);
  const r = await p.evaluate(() => ({ v: S.visits.filter(v => v.caseId === 'c_l' && !v.void).map(v => [v.id, v.apptId || '']), t: apptOf(byId('tasks', 't_one')) }));
  assert(r.t === 'done' && r.v.some(([id, a]) => id !== 'v_old' && a === 't_one') && r.v.some(([id, a]) => id === 'v_old' && a === ''), JSON.stringify(r));
  await p.evaluate(() => { closeSheet(); viewCase('c_l'); }); await settle(p); assert(await p.evaluate(() => document.getElementById('sheetRoot').textContent.includes('SYN-L')), 'client page');
});

test('a linked appointment cannot be deleted (no delete button, delDoc refuses); an unlinked task still can; cancelling keeps history', async () => {
  assert(!(await p.evaluate(() => delDoc('tasks', 't_one'))) && await p.evaluate(() => !!byId('tasks', 't_one')), 'linked appointment deleted');
  assert(await p.evaluate(() => LOGT2.tasks.del(byId('tasks', 't_one')) === false && LOGT2.tasks.del(byId('tasks', 't_free')) === true), 'delete button rule');
  assert(await p.evaluate(() => delDoc('tasks', 't_free')) && await p.evaluate(() => !byId('tasks', 't_free')), 'unlinked task could not be deleted');
  await p.evaluate(async () => { const n = nowTs(); await putRaw('tasks', { id: 't_c', title: 'ویزیت SYN-L', due: addDays(today(), 5), time: '11:00', caseId: 'c_l', status: 'open', area: 'therapy', created: n, updated: n }); });
  await p.reload(); await settle(p); await p.evaluate(() => apptSet('t_c', 'cancelled')); await settle(p);
  const c = await p.evaluate(() => { const t = byId('tasks', 't_c'); return t && [apptOf(t), t.status, /لغو/.test(t.note || '')]; }); assert(c && c[0] === 'cancelled' && c[1] === 'done' && c[2], 'cancel: ' + JSON.stringify(c));
  const v = await invariants(p); assert(!v.length, v.join('; ')); assert(!o.errors.length, o.errors.join(' | '));
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
