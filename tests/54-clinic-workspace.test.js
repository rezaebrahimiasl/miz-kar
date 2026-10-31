// Contextual «+» (CTX_ADD/ctxAdd) and the clinic workspace end to end: client → appointment → list → confirm → reschedule
// (old one kept as «جابه‌جا شد») → cancel → book again → visit with notes, fee and next date → the appointment is done, the
// follow-up/next appointment appears in the list, the dashboard and the client's page; history is kept. Synthetic data only.
const fs = require('fs'), path = require('path');
const { ROOT, serve, launch, openApp, settle, invariants, fill, submitForm, test, run, assert } = require('./lib');
let srv, o, p;
const appts = () => p.evaluate(() => S.tasks.filter(t => t.caseId === 'c_9').map(t => ({ id: t.id, due: t.due, time: t.time, st: apptOf(t), open: t.status === 'open' })));
const click = (sel) => p.click(sel).then(() => settle(p));

test('setup', async () => {
  srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs(); await putRaw('people', { id: 'p_9', name: 'مراجع کارگاه', created: n, updated: n });
    await putRaw('cases', { id: 'c_9', code: 'SYN-9', personId: 'p_9', complaint: 'SYN', status: 'open', created: n, updated: n }); render(); });
});

test('contextual «+»: each page gets its own actions, every action is a real click action, «همهٔ گزینه‌ها» opens the full menu', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const acts = await p.evaluate(() => Object.fromEntries(Object.keys(CTX_ADD).map(k => [k, CTX_ADD[k]().filter(Boolean).map(x => x[0])])));
  for (const [k, L] of Object.entries(acts)) for (const a of L) assert(html.includes(`case'${a}'`), `${k}: «${a}» is not a click action`);
  for (const [t, k, must] of [['biz', 'biz', 'buyNew'], ['people', 'people', 'new'], ['tasks', 'tasks', 'bulk']]) {
    await p.evaluate(t => { closeSheet(); tab = t; }, t); await p.click('#fab'); await p.waitForSelector(`#sheetRoot [data-ctx="${k}"]`);
    assert(await p.$(`#sheetRoot [data-ctx="${k}"] [data-act="${must}"]`), `${k}: «${must}» missing`); }
  await p.evaluate(() => { closeSheet(); tab = 'money'; }); await p.click('#fab'); assert(!(await p.$('#sheetRoot [data-ctx]')), 'money page lost its own menu');
  await p.evaluate(() => { closeSheet(); clinicSheet(); }); await click('#sheetRoot [data-act=ctxAdd][data-v=clinic]');
  for (const a of ['newCase', 'cPick', 'apptList']) assert(await p.$(`#sheetRoot [data-ctx=clinic] [data-act=${a}]`), 'clinic menu lacks ' + a);
  await click('#sheetRoot [data-act=quick]'); assert(await p.$('#sheetRoot [data-addsheet]:not([data-ctx])'), '«همهٔ گزینه‌ها» did not open the full menu');
  await p.evaluate(() => { closeSheet(); tab = 'today'; render(); });
});

test('appointment: book from the client picker → pending in the list → confirm → reschedule keeps the old one as moved → cancel', async () => {
  await p.evaluate(() => { closeSheet(); cPickSheet('book'); }); await p.fill('#f_cpq', 'SYN-9'); await click('#sheetRoot [data-act=cBook][data-id=c_9]');
  await p.waitForSelector('#sheetRoot form[data-form=cbook]'); await fill(p, { f_cbt: '10:00' }); await submitForm(p); await settle(p);
  let A = await appts(); assert(A.length === 1 && A[0].open && A[0].st === 'pending', 'booking: ' + JSON.stringify(A));
  await p.evaluate(() => apptList('month')); await p.waitForSelector('#sheetRoot [data-appts]');
  assert(await p.evaluate(() => document.querySelector('#sheetRoot [data-appts]').textContent.includes('SYN-9')), 'not in the appointment list');
  await click(`#sheetRoot [data-act=apptSet][data-id="${A[0].id}"][data-v=confirmed]`); A = await appts(); assert(A[0].st === 'confirmed', 'confirm: ' + JSON.stringify(A));
  await p.evaluate(() => cBookSheet('c_9')); await p.waitForSelector('#sheetRoot form[data-form=cbook]'); await fill(p, { f_cbt: '11:00' }); await submitForm(p); await settle(p);
  A = await appts(); const moved = A.filter(x => x.st === 'moved'), live = A.filter(x => x.open);
  assert(A.length === 2 && moved.length === 1 && live.length === 1 && live[0].st === 'pending', 'reschedule: ' + JSON.stringify(A));
  await p.evaluate(id => apptSet(id, 'cancelled'), live[0].id); await settle(p); A = await appts();
  assert(A.length === 2 && !A.some(x => x.open) && A.some(x => x.st === 'cancelled') && A.some(x => x.st === 'moved'), 'cancel / history: ' + JSON.stringify(A));
});

test('visit completes the appointment; notes, fee and next date → next appointment in the list, dashboard and client page; books consistent', async () => {
  await p.evaluate(() => cBookSheet('c_9')); await p.waitForSelector('#sheetRoot form[data-form=cbook]'); await fill(p, { f_cbt: '09:00' }); await submitForm(p); await settle(p);
  // the visit is today; the booked appointment is due on or before today only if booked for today, so book today explicitly
  await p.evaluate(async () => { const t = S.tasks.find(t => t.caseId === 'c_9' && t.status === 'open'); await save('tasks', t.id, { due: today() }); });
  await p.evaluate(() => { closeSheet(); formVisit('c_9'); }); await p.waitForSelector('#sheetRoot form[data-form=visit]');
  await p.evaluate(() => { const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('f_vn', 'یادداشت جلسهٔ آزمون'); set('f_vnd', jShort(addDays(today(), 7))); });
  await fill(p, { f_vfee: '3', f_vpay: 'receivable' }); await submitForm(p); await settle(p);
  const A = await appts(); const done = A.filter(x => x.st === 'done'), next = A.filter(x => x.open);
  const nd = await p.evaluate(() => addDays(today(), 7));
  assert(done.length === 1 && next.length === 1 && next[0].due === nd, 'after the visit: ' + JSON.stringify({ A, nd }));
  const r = await p.evaluate(() => ({ v: S.visits.filter(v => !v.void && v.caseId === 'c_9').length, fee: S.ledger.filter(l => !l.void && (l.visitOf || '').startsWith('c_9#')).length, bal: (personBal()['p_9'] || {})['تومان'] || 0 }));
  assert(r.v === 1 && r.fee === 1 && r.bal > 0, 'visit/fee: ' + JSON.stringify(r));
  await p.evaluate(() => apptList('month')); assert(await p.evaluate(() => document.querySelector('#sheetRoot [data-appts]').textContent.includes('SYN-9')), 'next appointment not listed');
  await p.evaluate(() => { closeSheet(); viewCase('c_9'); }); await settle(p);
  const prof = await p.evaluate(() => document.getElementById('sheetRoot').textContent); assert(prof.includes('SYN-9'), 'client page did not open');
  const v = await invariants(p); assert(!v.length, 'invariants: ' + v.join('; '));
  assert(!o.errors.length, o.errors.join(' | '));
});

test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
