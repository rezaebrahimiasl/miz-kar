// v4.27 fixes: search matches Persian and Latin digits and is reachable from «فاکتورها و اسناد»; the automatic Google
// Calendar sign-in never leaves the app unless the internet really answers. Synthetic data only; Google is never reached
// (every external host is blocked by the test browser, which is what an unreliable connection looks like to the app).
const { serve, launch, openApp, ready, test, run, assert } = require('./lib');
let srv;

test('search: «1405-777», «۱۴۰۵-۷۷۷» and «777» all find the document; digits in other fields too; vault and visit notes stay out', async () => {
  srv = await serve(); const o = await launch(); const p = o.page; await openApp(o, srv.url);
  await p.evaluate(async () => { const n = nowTs(), b = { created: n, updated: n, void: false };
    await putRaw('people', { id: 'pd1', name: 'طرف آزمون رقم', ...b });
    await putRaw('docs', { id: 'dd1', type: 'invoice', no: '۱۴۰۵-۷۷۷', personId: 'pd1', date: today(), items: [{ desc: 'عسل ۳ کیلویی آزمون', qty: 1, unit: 'عدد', price: 1e6 }], ...b });
    await putRaw('docs', { id: 'dd2', type: 'invoice', no: '1405-888', personId: 'pd1', date: today(), items: [], ...b });
    await putRaw('cheques', { id: 'cd1', dir: 'in', no: '۴۴۵۵۶۶', personId: 'pd1', amount: 1e6, due: today(), status: 'wait', ...b });
    await putRaw('vault', { id: 'vd1', title: 'رمز ۷۷۷ آزمون', ...b });
    await putRaw('cases', { id: 'cx1', code: 'SYN-9', personId: 'pd1', status: 'open', ...b });
    await putRaw('visits', { id: 'vx1', caseId: 'cx1', no: 1, date: today(), obs: 'یادداشت ۷۷۷ SYN-VISIT', ...b }); render(); });
  const find = q => p.evaluate(q => { closeSheet(); ui.gs = {}; searchSheet(); document.getElementById('gq').value = q; runSearch(q); const g = document.getElementById('gres');
    return { docs: [...g.querySelectorAll('[data-act=docView]')].map(x => x.dataset.id), chq: [...g.querySelectorAll('[data-act=chqView]')].map(x => x.dataset.id), text: g.innerText }; }, q);
  const bad = [];
  for (const [q, want] of [['1405-777', ['dd1']], ['۱۴۰۵-۷۷۷', ['dd1']], ['777', ['dd1']], ['۸۸۸', ['dd2']], ['1405-888', ['dd2']], ['3 کیلویی', ['dd1']]]) {
    const r = await find(q); if (JSON.stringify(r.docs) !== JSON.stringify(want)) bad.push(`${q} → ${JSON.stringify(r.docs)}`);
    if (/رمز|SYN-VISIT/.test(r.text)) bad.push(`${q} showed a vault item or a visit note`); }
  const c = await find('445566'); if (JSON.stringify(c.chq) !== '["cd1"]') bad.push('cheque by Latin digits → ' + JSON.stringify(c.chq));
  assert(!bad.length, bad.join(' ; '));
  // the shared nrm() is unchanged: it does not convert digits
  assert(await p.evaluate(() => nrm('۱۲3') === '۱۲3'), 'nrm() changed');

  // «فاکتورها و اسناد» → «جستجو در اسناد»: global search opens limited to documents
  await p.evaluate(() => { closeSheet(); docsSheet(); });
  const btn = await p.evaluate(() => { const b = document.querySelector('#sheetRoot [data-act=docSearch]'); if (!b) return null; const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { h: r.height, t: r.top, b: r.bottom, vh: innerHeight, onTop: !!(e && e.closest('[data-act=docSearch]')), text: b.textContent.trim() }; });
  assert(btn && btn.h > 0 && btn.b <= btn.vh && btn.onTop && btn.text.includes('جستجو'), 'search button not visible without scrolling on the documents page: ' + JSON.stringify(btn));
  await p.click('#sheetRoot [data-act=docSearch]'); await p.waitForSelector('#gq');
  const s = await p.evaluate(() => { document.getElementById('gq').value = 'طرف آزمون رقم'; runSearch('طرف آزمون رقم'); const g = document.getElementById('gres');
    return { where: document.getElementById('gs_t').value, adv: !document.getElementById('gsAdv').hidden, docs: g.querySelectorAll('[data-act=docView]').length, other: g.querySelectorAll('[data-act=viewPerson],[data-act=chqView]').length }; });
  assert(s.where === 'docs' && s.adv && s.docs === 2 && s.other === 0, 'documents-only search: ' + JSON.stringify(s));
  assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close();
});

// Google Calendar on, no sign-in in this session, one item waiting to be sent: the situation in which the app signs in automatically.
async function gcDevice(versionJson) {
  const o = await launch(); const p = o.page; const google = [];
  p.on('request', r => { if (r.url().startsWith('https://accounts.google.com')) google.push(r.url()); });
  if (versionJson) await p.route('**/version.json*', versionJson);
  await openApp(o, srv.url);
  await p.evaluate(async () => { const n = nowTs(); await putRaw('meta', { id: 'gcal', clientId: 'synthetic-client.apps.googleusercontent.com', on: true, modes: { task: 'auto' }, created: n, updated: n });
    await putRaw('tasks', { id: 'tgc', title: 'کار آزمون تقویم', due: today(), time: '10:00', status: 'open', created: n, updated: n }); sessionStorage.removeItem('miz.gc.tried'); });
  assert((await p.evaluate(() => gcPlan().ups.length)) === 1 && await p.evaluate(() => navigator.onLine), 'fixture: nothing to send or browser offline');
  await p.reload(); await ready(p).catch(() => {}); await p.waitForTimeout(5500);   // gcBoot after 1.2 s + the check (at most 3 s)
  return { o, p, google, url: p.url(), app: await p.evaluate(() => typeof LOAD_OK !== 'undefined' && LOAD_OK).catch(() => false) };
}

test('Google sign-in: no internet (request fails) → the app stays open and does not navigate to Google', async () => {
  const r = await gcDevice(route => route.abort());
  assert(r.app && r.url.startsWith(srv.url) && !r.google.length, `left the app: ${r.url} · google requests ${r.google.length}`); await r.o.ctx.close();
});

test('Google sign-in: Wi-Fi sign-in page (portal answers with HTML) → the app stays open', async () => {
  const r = await gcDevice(route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Wi-Fi login</title><h1>Sign in</h1>' }));
  assert(r.app && r.url.startsWith(srv.url) && !r.google.length, `left the app: ${r.url} · google requests ${r.google.length}`); await r.o.ctx.close();
});

test('Google sign-in: a connection that never answers → gives up within 3 s; the app stays open', async () => {
  const r = await gcDevice(() => {});                                   // the request hangs
  assert(r.app && r.url.startsWith(srv.url) && !r.google.length, `left the app: ${r.url} · google requests ${r.google.length}`); await r.o.ctx.close();
});

test('Google sign-in: internet available → the automatic sign-in still goes to Google (normal online behaviour kept)', async () => {
  const r = await gcDevice(null);                                       // the local server answers version.json
  assert(r.google.length >= 1, 'no sign-in attempt although the internet answered'); await r.o.ctx.close();
});

test('Google sign-in: the manual sign-in is unchanged (no connectivity check in between)', async () => {
  const o = await launch(); const p = o.page; const google = []; p.on('request', r => { if (r.url().startsWith('https://accounts.google.com')) google.push(r.url()); });
  await p.route('**/version.json*', route => route.abort()); await openApp(o, srv.url);
  await p.evaluate(async () => { const n = nowTs(); await putRaw('meta', { id: 'gcal', clientId: 'synthetic-client.apps.googleusercontent.com', on: true, created: n, updated: n }); });
  await p.evaluate(() => { gcAuth(false, 'sync'); }).catch(() => {}); await p.waitForTimeout(1500);
  assert(google.length >= 1, 'manual sign-in did not start'); await o.ctx.close(); await srv.close();
});

run(__filename);
