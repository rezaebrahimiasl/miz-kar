// Appointment fields and integrity: duration, service, referrer, note; time ranges in the list; overlap by ranges (a refused
// booking changes nothing); one visit completes exactly one appointment (with the actual end time); older appointments without
// the new fields get safe defaults; proactive prompts (past without outcome, clients with no next appointment). Synthetic data only.
const { serve, launch, openApp, settle, invariants, fill, submitForm, test, run, assert } = require('./lib');
let srv, o, p;
const T = () => p.evaluate(() => S.tasks.filter(t => t.caseId).map(t => ({ id: t.id, c: t.caseId, due: t.due, time: t.time, dur: t.dur, svc: t.svc, refBy: t.refBy, refName: t.refName, st: apptOf(t), open: t.status === 'open', endAt: t.endAt })));
async function book(cid, fields) { await p.evaluate(c => { closeSheet(); cBookSheet(c); }, cid); await p.waitForSelector('#sheetRoot form[data-form=cbook]'); await fill(p, fields); await submitForm(p); await settle(p); }

test('setup', async () => {
  srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs(); for (const [id, nm] of [['p_a', 'مراجع الف'], ['p_b', 'مراجع ب'], ['p_r', 'معرف آزمون']]) await putRaw('people', { id, name: nm, created: n, updated: n });
    await putRaw('cases', { id: 'c_a', code: 'SYN-A', personId: 'p_a', status: 'open', created: n, updated: n }); await putRaw('cases', { id: 'c_b', code: 'SYN-B', personId: 'p_b', status: 'open', created: n, updated: n });
    // an appointment made before 4.35: no dur/svc/appt
    await putRaw('tasks', { id: 't_old', title: 'ویزیت SYN-B', due: addDays(today(), 3), time: '09:00', caseId: 'c_b', status: 'open', area: 'therapy', created: n, updated: n }); render(); });
});

test('booking stores duration, service, referrer (linked person) and note; the list shows the time range', async () => {
  const d = await p.evaluate(() => jShort(addDays(today(), 2)));
  await book('c_a', { f_cbd: d, f_cbt: '10:00', f_cbl: '45', f_cbs: 'حجامت', f_cbr: 'معرف آزمون', f_cbn: 'ناشتا بیاید' });
  const A = (await T()).filter(x => x.c === 'c_a'); assert(A.length === 1 && A[0].dur === 45 && A[0].svc === 'حجامت' && A[0].refBy === 'p_r', 'fields: ' + JSON.stringify(A));
  assert(await p.evaluate(() => byId('cases', 'c_a').refBy === 'p_r'), 'referrer not kept on the client file');
  await p.evaluate(() => apptList('week')); const txt = await p.evaluate(() => document.querySelector('#sheetRoot [data-appts]').textContent);
  assert(txt.includes('۱۰:۰۰–۱۰:۴۵') && txt.includes('حجامت') && txt.includes('معرف آزمون'), 'list: ' + txt.slice(0, 300));
  // older appointment: default length from the clinic settings, shown as a range, nothing written to it
  assert(await p.evaluate(() => { const t = byId('tasks', 't_old'); return tLen(t) === CLH().len && apptRange(t).includes('–') && t.dur === undefined && apptOf(t) === 'pending'; }), 'older appointment defaults');
});

test('overlap is checked by ranges: 10:30 clashes with 10:00–10:45, 10:45 does not; a refused booking leaves the old appointment untouched', async () => {
  assert(await p.evaluate(() => overlap(630, 30, 600, 45) && !overlap(645, 30, 600, 45)), 'overlap()');
  const d = await p.evaluate(() => jShort(addDays(today(), 2)));
  const before = await T(); await p.evaluate(() => { closeSheet(); cBookSheet('c_b'); }); await p.waitForSelector('#sheetRoot form[data-form=cbook]');
  await fill(p, { f_cbd: d, f_cbt: '10:30', f_cbl: '30' }); await p.click('#sheetRoot form[data-form=cbook] button.pri'); await settle(p);
  let after = await T(); assert(JSON.stringify(after) === JSON.stringify(before), 'a refused (clashing) booking changed appointments: ' + JSON.stringify(after.filter(x => x.c === 'c_b')));
  await book('c_b', { f_cbd: d, f_cbt: '10:45', f_cbl: '30' }); after = (await T()).filter(x => x.c === 'c_b');
  assert(after.length === 2 && after.filter(x => x.open).length === 1 && after.find(x => x.id === 't_old').st === 'moved' && after.find(x => x.open).time === '10:45', 'reschedule: ' + JSON.stringify(after));
});

test('two appointments the same day: a visit completes only one and records the actual end time; the other stays open', async () => {
  await p.evaluate(async () => { const n = nowTs(); for (const [id, tm] of [['t_m1', '08:00'], ['t_m2', '23:59']]) await putRaw('tasks', { id, title: 'ویزیت SYN-A', due: today(), time: tm, caseId: 'c_a', status: 'open', area: 'therapy', created: n, updated: n });
    for (const t of S.tasks.filter(t => t.caseId === 'c_a' && t.due !== today() && t.status === 'open')) await save('tasks', t.id, { status: 'done', appt: 'cancelled' }); });
  await p.reload(); await settle(p);
  await p.evaluate(() => { closeSheet(); formVisit('c_a'); }); await p.waitForSelector('#sheetRoot form[data-form=visit]');
  await p.evaluate(() => { const e = document.getElementById('f_vn'); if (e) { e.value = 'جلسهٔ آزمون'; e.dispatchEvent(new Event('input', { bubbles: true })); } }); 
  // two open appointments that day: saving without choosing is refused, nothing is written
  const nv0 = await p.evaluate(() => S.visits.length); await p.click('#sheetRoot form[data-form=visit] button.pri'); await settle(p);
  assert((await p.evaluate(() => S.visits.length)) === nv0, 'a visit was saved without choosing among two appointments');
  await p.evaluate(() => { document.getElementById('f_vap').value = 't_m1'; }); await submitForm(p); await settle(p);
  const A = (await T()).filter(x => x.id === 't_m1' || x.id === 't_m2'); const done = A.filter(x => x.st === 'done');
  assert(done.length === 1 && A.filter(x => x.open).length === 1 && /^\d\d:\d\d$/.test(done[0].endAt || ''), 'same-day: ' + JSON.stringify(A));
  assert(done[0].id === 't_m1' && await p.evaluate(() => S.visits.some(v => !v.void && v.caseId === 'c_a' && v.apptId === 't_m1')), 'visit not linked to the chosen appointment');
});

test('proactive: past appointment without outcome and a client with no next appointment are listed on the clinic page with actions', async () => {
  await p.evaluate(async () => { const n = nowTs(); await putRaw('tasks', { id: 't_past', title: 'ویزیت SYN-B', due: addDays(today(), -2), time: '10:00', caseId: 'c_b', status: 'open', area: 'therapy', created: n, updated: n });
    await putRaw('cases', { id: 'c_c', code: 'SYN-C', status: 'open', created: n, updated: n }); });
  await p.reload(); await settle(p);
  const N = await p.evaluate(() => { const r = apptNeeds(); return { past: r.past.map(t => t.id), again: r.again.map(x => x.c.id) }; });
  assert(N.past.includes('t_past') && N.again.includes('c_c') && !N.again.includes('c_b'), 'needs: ' + JSON.stringify(N));
  await p.evaluate(() => { closeSheet(); clinicSheet(); }); await settle(p);
  assert(await p.$('#sheetRoot [data-act=cBook][data-id=c_c]') && await p.$('#sheetRoot .banner[data-act=apptList]'), 'clinic page shows no prompts');
  const v = await invariants(p); assert(!v.length, v.join('; ')); assert(!o.errors.length, o.errors.join(' | '));
});

test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
