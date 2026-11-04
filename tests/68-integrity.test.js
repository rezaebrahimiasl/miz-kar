// WP-3: the data-integrity page (integCheck / integSheet / integText) is read-only, finds the D1 case (an older document version
// made live again before 4.21) and the other structural problems, and never shows a person's name, an amount or clinical text.
// Synthetic data only.
const { serve, launch, openApp, settle, test, run, assert } = require('./lib');
let srv, o, p;
const NAME = 'نام‌خصوصی آزمون', AMT = 7777777, CLIN = 'SYN-CLIN-9';
const disk = () => p.evaluate(() => new Promise(r => { const q = idb.transaction('docs').objectStore('docs').getAll(); q.onsuccess = () => r(JSON.stringify(q.result.map(x => x.k + JSON.stringify(x.doc)).sort())); }));

test('setup: synthetic records with every kind of problem', async () => {
  srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async ([NAME, AMT, CLIN]) => { const n = nowTs(), old = '2026-10-20T08:00:00.000Z';
    await putRaw('people', { id: 'p1', name: NAME, created: n, updated: n });
    await putRaw('people', { id: 'p2', name: 'ادغام‌شدهٔ آزمون', mergedInto: 'p1', created: n, updated: n });
    await putRaw('lots', { id: 'L1', product: 'عسل', variety: 'آزمون', qty: 10, unit: 'کیلو', cost: 1e6, currency: 'تومان', date: '2026-10-01', code: '901', source: 'buy', created: n, updated: n });
    // D1 before 4.21: v1 restored (live) next to v2 that replaced it; v1 still has a live stock move
    await putRaw('docs', { id: 'dv1', type: 'invoice', no: 41, date: '2026-10-10', personId: 'p1', items: [], posted: true, created: old, updated: old });
    await putRaw('docs', { id: 'dv2', type: 'invoice', no: 41, date: '2026-10-11', personId: 'p1', items: [], posted: true, redoOf: 'dv1', created: old, updated: old });
    await putRaw('moves', { id: 'mv1', kind: 'sale', lotId: 'L1', qty: 1, price: AMT, currency: 'تومان', date: '2026-10-10', docId: 'dv1', created: n, updated: n });
    // the same after 4.21 (unexpected), two levels deep: w1 live, w2 void, w3 live replaces w2
    await putRaw('docs', { id: 'w1', type: 'purchase', no: 7, date: '2026-11-01', items: [], created: n, updated: n });
    await putRaw('docs', { id: 'w2', type: 'purchase', no: 7, date: '2026-11-02', items: [], redoOf: 'w1', void: true, created: n, updated: n });
    await putRaw('docs', { id: 'w3', type: 'purchase', no: 7, date: '2026-11-03', items: [], redoOf: 'w2', created: n, updated: n });
    // D1 whose old version changed after 4.21 (an edit or sync moved «updated»): still listed with D1, marked uncertain
    await putRaw('docs', { id: 'm1', type: 'invoice', no: 51, date: '2026-10-12', items: [], created: old, updated: n });
    await putRaw('docs', { id: 'm2', type: 'invoice', no: 51, date: '2026-10-13', items: [], redoOf: 'm1', created: old, updated: old });
    // exact boundaries: newer version created exactly at the fix → after; old version changed exactly at the fix → uncertain
    await putRaw('docs', { id: 'b1', type: 'invoice', no: 61, date: '2026-10-14', items: [], created: old, updated: old });
    await putRaw('docs', { id: 'b2', type: 'invoice', no: 61, date: '2026-10-15', items: [], redoOf: 'b1', created: D1_FIX, updated: D1_FIX });
    await putRaw('docs', { id: 'c1', type: 'invoice', no: 62, date: '2026-10-14', items: [], created: old, updated: D1_FIX });
    await putRaw('docs', { id: 'c2', type: 'invoice', no: 62, date: '2026-10-15', items: [], redoOf: 'c1', created: old, updated: old });
    // a live row of a voided document; a row of a missing person; a row linked to a merged person; a missing settled row
    await putRaw('docs', { id: 'dvoid', type: 'invoice', no: 9, date: '2026-10-05', items: [], void: true, created: n, updated: n });
    await putRaw('ledger', { id: 'lo', kind: 'receivable', amount: AMT, currency: 'تومان', date: '2026-10-05', docId: 'dvoid', personId: 'p1', about: CLIN, created: n, updated: n });
    await putRaw('ledger', { id: 'lx', kind: 'received', amount: AMT, currency: 'تومان', date: '2026-10-06', personId: 'nobody', category: 'فروش', acct: 'بانک الف', created: n, updated: n });
    await putRaw('ledger', { id: 'lm', kind: 'received', amount: AMT, currency: 'تومان', date: '2026-10-06', personId: 'p2', category: 'فروش', acct: 'بانک الف', visitOf: 'c1#1', about: CLIN, created: n, updated: n });
    await putRaw('ledger', { id: 'lr', kind: 'received', amount: 1, currency: 'تومان', date: '2026-10-07', refId: 'gone', category: 'فروش', acct: 'بانک الف', created: n, updated: n });
    // one bank message confirming two rows
    for (const id of ['r1', 'r2']) await putRaw('ledger', { id, kind: 'paid', amount: AMT, currency: 'تومان', date: '2026-10-08', category: 'اجاره', acct: 'بانک الف', rcpt: 'ref:445566', created: n, updated: n });
    render(); }, [NAME, AMT, CLIN]);
  await settle(p);
});

test('findings: D1 dated before 4.21, the post-4.21 case, orphan rows, links and duplicate receipts', async () => {
  const R = await p.evaluate(() => { const R = integCheck(); return Object.fromEntries(R.groups.map(g => [g.k, g.items.map(x => x.id || x.lbl)])); });
  assert(JSON.stringify([...R.d1].sort()) === '["c1","dv1","m1"]', 'D1 before 4.21 (incl. uncertain): ' + JSON.stringify(R.d1));
  assert(JSON.stringify([...R.d1n].sort()) === '["b1","w1"]', 'two live versions after 4.21 (through a voided middle version; created exactly at the fix): ' + JSON.stringify(R.d1n));
  const when = await p.evaluate(() => Object.fromEntries(integCheck().groups.filter(g => /^d1/.test(g.k)).flatMap(g => g.items).map(x => [x.id, x.when])));
  assert(when.dv1 === 'before' && when.m1 === 'maybe' && when.c1 === 'maybe' && when.b1 === 'after' && when.w1 === 'after', 'classification: ' + JSON.stringify(when));
  assert(await p.evaluate(() => /قطعی نیست/.test(integCheck().groups.find(g => g.k === 'd1').items.find(x => x.id === 'm1').note)), 'uncertain case not marked');
  assert(R.orph && R.orph.includes('lo') && !R.orph.includes('mv1'), 'orphan rows: ' + JSON.stringify(R.orph));
  assert(R.link && ['lx', 'lm', 'lr'].every(x => R.link.includes(x)), 'links: ' + JSON.stringify(R.link));
  assert(R.rcpt && R.rcpt.length === 2, 'duplicate receipts: ' + JSON.stringify(R.rcpt));
  const d1 = await p.evaluate(() => integCheck().groups.find(g => g.k === 'd1').items[0].note);
  assert(/هنوز معتبر/.test(d1) && /۱/.test(d1), 'D1 note names the live postings: ' + d1);
});

test('restoring a replaced version while a newer one is live is refused (no new D1); allowed once the newer one is voided; the reverse direction is refused too', async () => {
  await p.evaluate(async () => { const n = nowTs(); await putRaw('docs', { id: 'r_old', type: 'invoice', no: 71, date: '2026-11-01', items: [], void: true, voidReason: 'اصلاح شد', voidAt: n, created: n, updated: n });
    await putRaw('docs', { id: 'r_new', type: 'invoice', no: 71, date: '2026-11-02', items: [], redoOf: 'r_old', created: n, updated: n }); });
  const a = await p.evaluate(async () => ({ r: await docVoid('r_old', false), live: !byId('docs', 'r_old').void, toast: document.getElementById('toast').textContent }));
  assert(a.r === false && !a.live && /نسخهٔ جدیدتری/.test(a.toast), 'restore with a live newer version: ' + JSON.stringify(a));
  const b = await p.evaluate(async () => { await docVoid('r_new', true); return { r: await docVoid('r_old', false), live: !byId('docs', 'r_old').void }; });
  assert(b.r === true && b.live, 'restore after voiding the newer version: ' + JSON.stringify(b));
  // the other direction: with the old version live again, restoring the newer one is refused too (both voided, then both restored)
  const c = await p.evaluate(async () => ({ r: await docVoid('r_new', false), live: !byId('docs', 'r_new').void, toast: document.getElementById('toast').textContent }));
  assert(c.r === false && !c.live && /نسخهٔ قدیمی‌تری/.test(c.toast), 'restore of the newer version while the older is live: ' + JSON.stringify(c));
  assert(await p.evaluate(() => !integCheck().groups.some(g => /^d1/.test(g.k) && g.items.some(x => /^r_/.test(x.id)))), 'restore guard left a D1 pair');
});

test('read-only: checking, showing and copying the report write nothing (database, memory, local storage)', async () => {
  const d0 = await disk(), m0 = await p.evaluate(() => JSON.stringify(S)), LS = () => p.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => !/^miz\.(uiF|used|use)$/.test(k)).sort())), l0 = await LS();
  const w = await p.evaluate(async () => { let n = 0; const why = []; const P = IDBObjectStore.prototype, keep = [P.put, P.add, P.delete, P.clear], ls = Storage.prototype.setItem;
    P.put = P.add = P.delete = P.clear = function () { n++; why.push('idb ' + this.name); return keep[0].apply(this, arguments); }; Storage.prototype.setItem = function (k) { if (!/^miz\.(uiF|used|use)$/.test(k)) {   // usage counters of a button tap are not data
       n++; why.push((this === sessionStorage ? 'session ' : 'local ') + k); } return ls.apply(this, arguments); };
    try { integCheck(); integSheet(); integText(); document.querySelector('#sheetRoot [data-act=integCopy]').click(); await new Promise(r => setTimeout(r, 200)); }
    finally { [P.put, P.add, P.delete, P.clear] = keep; Storage.prototype.setItem = ls; } return { n, why }; });
  await settle(p);
  assert(w.n === 0, w.n + ' writes during the integrity check: ' + w.why.join(', '));
  assert((await disk()) === d0 && (await p.evaluate(() => JSON.stringify(S))) === m0, 'data changed');
  assert((await LS()) === l0, 'local storage changed');
});

test('privacy: no person name, amount or clinical text on the page or in the copied report', async () => {
  const r = await p.evaluate(() => { integSheet(); return { page: document.getElementById('sheetRoot').innerText, text: integText() }; });
  for (const [k, t] of Object.entries(r)) for (const bad of [NAME, 'ادغام‌شدهٔ آزمون', String(AMT), '۷٬۷۷۷٬۷۷۷', '۷۷۷۷۷۷۷', '۷,۷۷۷,۷۷۷', CLIN])
    assert(!t.includes(bad), `${k} shows «${bad}»`);
  assert(/ردیف مالی ویزیت/.test(r.page) && /docs\/dv1/.test(r.text), 'labels / record keys missing: ' + r.text.slice(0, 300));
});

test('a clean data set reports nothing; the page opens from the menu; no page errors, nothing sent', async () => {
  const o2 = await launch(); await openApp(o2, srv.url);
  const r = await o2.page.evaluate(() => { integSheet(); return { n: integCheck().n, t: document.getElementById('sheetRoot').innerText }; });
  assert(r.n === 0 && /مشکلی پیدا نشد/.test(r.t), 'clean: ' + JSON.stringify(r));
  await o2.page.evaluate(() => { closeSheet(); const b = document.createElement('button'); b.dataset.act = 'integ'; document.body.appendChild(b); b.click(); b.remove(); });
  await o2.page.waitForFunction(() => /عیب‌یابی داده‌ها/.test(document.getElementById('sheetRoot').innerText));
  assert(!o2.errors.length && !o.errors.length, [...o.errors, ...o2.errors].join(' | ')); assert(!o.net.external.length, o.net.external.join(' | '));
  await o2.ctx.close();
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
