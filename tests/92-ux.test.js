// v4.26 UX: toast duration and tap-to-close, feedback layers that never cover each other / the quick-entry button / the
// search box, search for documents and cheques (privacy exclusions kept), the «ابزارها» group in Tasks, «امروز» as the
// start tab, and no automatic print preview after saving a document. Phone-sized, synthetic data only.
const { serve, launch, openApp, ready, openDoc, submit, settle, test, run, assert } = require('./lib');
let srv, o, p;
const rect = sel => p.evaluate(s => { const e = document.querySelector(s); if (!e || e.hidden || !e.offsetParent && getComputedStyle(e).position !== 'fixed') return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }, sel);
const hit = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const clickAct = (act, data = {}) => p.evaluate(([act, data]) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.act = act; Object.assign(b.dataset, data);
  const r = document.getElementById('sheetRoot'); (r.hidden ? document.body : r).appendChild(b); b.click(); b.remove(); }, [act, data]);
const N = () => p.evaluate(() => nowTs());

test('E: a new session starts on «امروز» even if another tab was last used; within a session the tab is kept', async () => {
  srv = await serve(); o = await launch(); p = o.page;
  await p.goto(srv.url); await ready(p);
  assert((await p.evaluate(() => tab)) === 'today', 'first launch tab: ' + await p.evaluate(() => tab));
  await p.evaluate(() => { localStorage.setItem('miz.onb', 'x'); localStorage.setItem('miz.seenVer', APP_VER); sessionStorage.setItem('mizSpl', '1'); goTab('money'); });
  await p.reload(); await ready(p); assert((await p.evaluate(() => tab)) === 'money', 'same session should keep «مالی»');
  await p.evaluate(() => sessionStorage.removeItem('miz.sess')); await p.reload(); await ready(p);   // a new session (app reopened)
  const r = await p.evaluate(() => ({ tab, kept: localStorage.getItem('miz.tab') })); assert(r.tab === 'today', 'new session tab: ' + JSON.stringify(r));
  await p.evaluate(() => goTab('home')); assert((await p.evaluate(() => tab)) === 'home' && await p.evaluate(() => !!document.querySelector('#tabs [data-tab=home]')), 'منظومه not reachable');
});

test('A: long messages stay readable (2.2–8 s by length) and a tap closes them', async () => {
  const ms = await p.evaluate(() => [toastMs('ثبت شد'), toastMs('x'.repeat(60)), toastMs('x'.repeat(200))]);
  assert(ms[0] === 2200 && ms[1] > 4000 && ms[1] < 6000 && ms[2] === 8000, 'durations: ' + ms);
  await p.evaluate(() => toast('پیام بلند آزمون: '.repeat(6))); await p.waitForTimeout(3000);
  assert(await p.evaluate(() => !document.getElementById('toast').hidden), 'long message gone after 3 s');
  await p.click('#toast'); assert(await p.evaluate(() => document.getElementById('toast').hidden), 'tap did not close the message');
  assert(await p.evaluate(() => document.getElementById('toast').getAttribute('aria-live') === 'polite'), 'no aria-live');
});

test('B: undo bar, message and the quick-entry button never overlap; inside a sheet they keep clear of the search box', async () => {
  const n = await N(); await p.evaluate(async n => { closeSheet(); goTab('today');
    await putRaw('tasks', { id: 'tu1', title: 'کار آزمون برای برگردان', status: 'open', due: today(), created: n, updated: n });
    for (const id of ['pq1', 'pq2']) await putRaw('ledger', { id, pending: true, kind: 'paid', amount: 1e6, currency: 'تومان', acct: 'بانک آزمون', about: 'آزمون', date: today(), settled: false, void: false, created: n, updated: n }); render(); }, n);
  await clickAct('archiveTask', { id: 'tu1' }); await settle(p); await p.waitForSelector('#undoBar');
  await p.evaluate(() => toast('پیام آزمون همزمان با نوار برگردان، کمی بلندتر از معمول برای دو خط'));
  const fab = await rect('#fab'), ub = await rect('#undoBar'), ts = await rect('#toast');
  assert(fab && ub && ts, 'missing element: ' + JSON.stringify({ fab, ub, ts }));
  assert(!hit(ub, fab) && !hit(ts, fab) && !hit(ts, ub), 'overlap without a sheet: ' + JSON.stringify({ fab, ub, ts }));
  assert(await p.evaluate(() => { const f = document.getElementById('fab').getBoundingClientRect(); const e = document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2); return !!(e && e.closest('#fab')); }), 'quick-entry button not tappable');
  await p.evaluate(() => { document.getElementById('undoBar').remove(); document.getElementById('toast').hidden = true; searchSheet(); });
  await clickAct('pendNo', { id: 'pq1' }); await settle(p); await p.waitForSelector('#undoBar');
  await p.evaluate(() => toast('پیام آزمون در صفحهٔ جستجو'));
  const gq = await rect('#gq'), ub2 = await rect('#undoBar'), ts2 = await rect('#toast');
  const btns = await p.evaluate(() => [...document.querySelectorAll('#sheetRoot [data-act=gsToggle], #sheetRoot [data-act=gsRun], #sheetRoot .search-in ~ button')].map(b => { const r = b.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
  assert(gq && ub2 && ts2, 'missing element in sheet: ' + JSON.stringify({ gq, ub2, ts2 }));
  const bad = [gq, ...btns].filter(x => hit(x, ub2) || hit(x, ts2)); assert(!bad.length && !hit(ub2, ts2), 'covers the search box/buttons: ' + JSON.stringify({ gq, ub2, ts2, bad }));
  await p.evaluate(() => { const u = document.getElementById('undoBar'); if (u) u.remove(); closeSheet(); });
});

test('C: search finds documents (number, party, subject, row text) and cheques; never vault items or visit notes; no duplicates', async () => {
  const n = await N(); await p.evaluate(async n => { const b = { created: n, updated: n, void: false };
    await putRaw('people', { id: 'ps1', name: 'شرکت جستجوی آزمون', ...b });
    await putRaw('docs', { id: 'dsr1', type: 'invoice', no: '1405-777', personId: 'ps1', date: today(), items: [{ desc: 'عسل گلاب آزمون', qty: 1, unit: 'کیلو', price: 1e6 }], ...b });
    await putRaw('docs', { id: 'dsr2', type: 'letter', no: 'ن-۹۹', subject: 'قرارداد همکاری آزمون', toName: 'دفتر نمونه', date: today(), ...b });
    await putRaw('docs', { id: 'dsr3', type: 'proforma', ...b });                                  // malformed: no number, party, date or items
    await putRaw('docs', { id: 'dsr4', type: 'invoice', no: '1405-778', items: null, personId: 'ps1', ...b, void: true });   // voided: hidden by default
    await putRaw('cheques', { id: 'csr1', dir: 'in', no: '556677', bank: 'بانک آزمونی', personId: 'ps1', amount: 2e6, due: today(), status: 'wait', about: 'چک فروش آزمون', ...b });
    await putRaw('vault', { id: 'vsr1', title: 'رمز گلاب آزمون', ...b });
    await putRaw('cases', { id: 'csx', code: 'SYN-7', personId: 'ps1', status: 'open', ...b });
    await putRaw('visits', { id: 'vsx', caseId: 'csx', no: 1, date: today(), obs: 'گلاب SYN-VISIT-SECRET', ...b }); render(); }, n);
  const find = q => p.evaluate(q => { closeSheet(); searchSheet(); document.getElementById('gq').value = q; runSearch(q); const g = document.getElementById('gres');
    return { text: g.innerText, docs: [...g.querySelectorAll('[data-act=docView]')].map(x => x.dataset.id), chq: [...g.querySelectorAll('[data-act=chqView]')].map(x => x.dataset.id) }; }, q);
  let r = await find('1405-777'); assert(JSON.stringify(r.docs) === '["dsr1"]', 'by number: ' + JSON.stringify(r.docs));
  r = await find('شرکت جستجوی'); assert(r.docs.includes('dsr1') && r.chq.includes('csr1') && new Set(r.docs).size === r.docs.length, 'by party: ' + JSON.stringify(r));
  r = await find('قرارداد همکاری'); assert(JSON.stringify(r.docs) === '["dsr2"]', 'by letter subject: ' + JSON.stringify(r.docs));
  r = await find('گلاب'); assert(JSON.stringify(r.docs) === '["dsr1"]' && !r.text.includes('رمز گلاب') && !r.text.includes('SYN-VISIT-SECRET'), 'row text / privacy: ' + JSON.stringify(r));
  r = await find('556677'); assert(JSON.stringify(r.chq) === '["csr1"]', 'cheque by number: ' + JSON.stringify(r.chq));
  r = await find('1405-778'); assert(!r.docs.length, 'voided document shown by default');
  r = await find('SYN-VISIT-SECRET'); assert(!r.text.includes('SYN-VISIT-SECRET'), 'visit note searchable');
  await p.evaluate(() => { document.getElementById('gq').value = 'پروفورما'; runSearch(''); closeSheet(); });
  assert(!o.errors.length, o.errors.join(' | '));
});

test('D: «+ کار» stays visible; every other Tasks tool is inside «ابزارها»; the jump row is gone and «بعداً» is a filter', async () => {
  const n = await N(); await p.evaluate(async n => { await putRaw('tasks', { id: 'tl1', title: 'کار بعدی آزمون', status: 'open', due: addDays(today(), 20), created: n, updated: n }); closeSheet(); goTab('tasks'); }, n);
  const r = await p.evaluate(() => { const v = document.getElementById('view'), d = v.querySelector('details.ttools'), add = v.querySelector('[data-act=new][data-v=task]');
    const inside = d ? [...d.querySelectorAll('[data-act]')].map(b => b.dataset.act) : [];
    return { add: !!add && !add.closest('details') && add.getBoundingClientRect().height > 0, closed: d && !d.open, inside, jump: !!v.querySelector('[data-act=tgJump]') }; });
  const need = ['bulk', 'tbook', 'meets', 'review']; assert(r.add && r.closed && need.every(a => r.inside.includes(a)) && !r.jump, 'tasks tab: ' + JSON.stringify(r));
  await p.click('details.ttools summary'); assert(await p.evaluate(() => document.querySelector('details.ttools').open && document.querySelector('details.ttools [data-act=bulk]').getBoundingClientRect().height > 0), '«ابزارها» does not open');
  const later = await p.evaluate(() => { ui.tSt = 'later'; const ids = taskSel().map(t => t.id); ui.tSt = 'open'; return ids; });
  assert(later.includes('tl1') && !later.includes('tu1'), 'later filter: ' + JSON.stringify(later));
  assert(await p.evaluate(() => FB.tasks.g[0].o().some(x => x[0] === 'later')), '«بعداً» not offered in the filter');
});

test('F: saving a letter or an invoice opens its page with a «چاپ» button and a message, not the print preview; printing still works', async () => {
  await p.evaluate(async () => { closeSheet(); await putRaw('people', { id: 'pf1', name: 'خریدار چاپ آزمون', created: nowTs(), updated: nowTs() }); });
  await openDoc(p, { type: 'letter', toName: 'گیرندهٔ آزمون', subject: 'نامهٔ آزمون چاپ', date: '2026-10-10', body: 'متن آزمون' }); await submit(p); await settle(p);
  const r = await p.evaluate(() => ({ preview: !!document.querySelector('[data-hv=close]'), sheet: !document.getElementById('sheetRoot').hidden, print: !!document.querySelector('#sheetRoot [data-act=docPrint]'),
    toast: document.getElementById('toast').textContent, doc: (S.docs.find(d => d.subject === 'نامهٔ آزمون چاپ') || {}).id }));
  assert(r.doc && !r.preview && r.sheet && r.print && r.toast.includes('ثبت شد') && r.toast.includes('چاپ'), 'after saving: ' + JSON.stringify(r));
  // a formal sales invoice (service row, so no stock is involved)
  await openDoc(p, { type: 'invoice', inv: true, personId: 'pf1', date: '2026-10-10', led: 'receivable', items: [{ desc: 'خدمت آزمون', qty: 1, unit: 'خدمت', price: 2e6, src: 'svc' }] }); await submit(p); await settle(p);
  const v = await p.evaluate(() => ({ preview: !!document.querySelector('[data-hv=close]'), print: !!document.querySelector('#sheetRoot [data-act=docPrint]'), toast: document.getElementById('toast').textContent,
    doc: !!S.docs.find(d => !d.void && d.type === 'invoice' && d.personId === 'pf1') }));
  assert(v.doc && !v.preview && v.print && v.toast.includes('فاکتور فروش ثبت شد'), 'after saving the invoice: ' + JSON.stringify(v));
  await p.click('#sheetRoot [data-act=docPrint]'); await p.waitForSelector('[data-hv=close]', { timeout: 5000 });
  await p.click('[data-hv=close]');
  assert(!o.errors.length, o.errors.join(' | '));
});

test('close', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
