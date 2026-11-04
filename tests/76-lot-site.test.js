// LOT-1: saving a lot with its money rows is one operation (local): a failure at any write leaves memory and database unchanged —
// new bought lot + payable, edit open→buy (new payable), edit of a bought lot (amount sync + packing). SITE-1: the shop site's
// exact origins are allowed by the CSP (no wildcard) and «همگام‌سازی» stores the catalogue; network error, HTTP error and an
// invalid answer keep the previous catalogue with a message. Synthetic data; the site is answered locally (no real request).
const fs = require('fs'), path = require('path');
const { ROOT, serve, launch, openApp, settle, fill, submitForm, invariants, test, run, assert } = require('./lib');
let srv, o, p;
const mem = () => p.evaluate(() => JSON.stringify(['lots', 'ledger', 'moves'].map(c => S[c].map(x => JSON.stringify(x)).sort())));
const disk = () => p.evaluate(() => new Promise(r => { const q = idb.transaction('docs').objectStore('docs').getAll(); q.onsuccess = () => r(JSON.stringify(q.result.filter(x => ['lots', 'ledger', 'moves'].includes(x.col)).map(x => x.k + JSON.stringify(x.doc)).sort())); }));
const failAt = col => p.evaluate(col => { if (!window._st) window._st = Store.stage; Store.stage = col ? function (B, c) { if (c === col) throw new Error('synthetic failure'); return window._st.apply(this, arguments); } : window._st; }, col);
const tapSave = () => p.evaluate(() => { const f = document.querySelector('#sheetRoot form[data-form=lot]'); (f.querySelector('button[type=submit]') || [...f.querySelectorAll('button.pri:not([type=button])')].pop()).click(); });
async function same(what, fn) { const m0 = await mem(), d0 = await disk(); await fn(); await p.waitForTimeout(400); await settle(p); assert((await mem()) === m0, what + ': memory changed'); assert((await disk()) === d0, what + ': database changed'); }
const setMods = m => p.evaluate(async m => { const P = S.meta.find(x => x.id === 'profile') || { id: 'profile', created: nowTs() }; await putRaw('meta', { ...P, mods: m, updated: nowTs() }); }, m);

test('setup (documents off so the stock-in form saves the lot itself)', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs(); await putRaw('people', { id: 's1', name: 'فروشندهٔ آزمون', created: n, updated: n });
    await putRaw('meta', { id: 'accts', a: { 'بانک الف': { open: 100e6, openDate: '2026-09-23', setAt: n } }, created: n, updated: n });
    await putRaw('lots', { id: 'LO', product: 'عسل', variety: 'باز', qty: 10, unit: 'کیلو', cost: 1e6, currency: 'تومان', date: '2026-10-01', code: '801', source: 'open', created: n, updated: n }); });
  await setMods(['acc', 'apiary', 'cheques', 'clinic', 'deals', 'ibadat', 'recurs', 'stock', 'trips', 'wins']); });

test('LOT-1 new bought lot on credit: a failure at the payable leaves no lot', async () => {
  await p.evaluate(() => { closeSheet(); formLot({}); }); await p.waitForSelector('#sheetRoot form[data-form=lot]');
  await fill(p, { f_prod: 'عسل', f_var: 'تازه', f_lqty: '۵' }); await p.evaluate(() => { const s = document.getElementById('f_src'); s.value = 'buy'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await fill(p, { f_lcost: '۱', f_lpay: 'credit', f_sup: 's1' });
  await failAt('ledger'); await same('new lot failure', tapSave); await failAt(null);
  await tapSave(); await p.waitForTimeout(400); await settle(p);
  const r = await p.evaluate(() => { const l = S.lots.find(x => !x.void && x.variety === 'تازه'); return l && S.ledger.filter(x => !x.void && x.lotId === l.id).length; });
  assert(r === 1, 'success: lot with one payable, got ' + r); const v = await invariants(p); assert(!v.length, v.join('; '));
});

test('LOT-1 edit open → buy with a cost: a failure at the lot leaves no payable; success writes both', async () => {
  const open = async () => { await p.evaluate(() => { closeSheet(); formLot(byId('lots', 'LO')); }); await p.waitForSelector('#sheetRoot form[data-form=lot]');
    await p.evaluate(() => { const s = document.getElementById('f_src'); s.value = 'buy'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await fill(p, { f_lcost: '۲', f_sup: 's1' }); };
  await open(); await failAt('lots'); await same('edit failure', tapSave); await failAt(null);
  await open(); await tapSave(); await p.waitForTimeout(400); await settle(p);
  const r = await p.evaluate(() => ({ src: byId('lots', 'LO').source, pay: S.ledger.filter(x => !x.void && x.lotId === 'LO').length }));
  assert(r.src === 'buy' && r.pay === 1, JSON.stringify(r)); const v = await invariants(p); assert(!v.length, v.join('; '));
});

test('SITE-1 CSP lists exactly the shop site\'s origins (no wildcard)', () => {
  const csp = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/connect-src ([^;]*);/)[1];
  assert(/https:\/\/asalereza\.com(\s|$)/.test(csp) && /https:\/\/www\.asalereza\.com(\s|$)/.test(csp) && !/\*/.test(csp), csp);
});

test('SITE-1 «همگام‌سازی»: a valid Store API answer is stored; network error, HTTP 500 and invalid JSON keep the old catalogue with a message', async () => {
  await setMods(null);
  let mode = 'ok'; await o.ctx.route(/^https:\/\/www\.asalereza\.com\//, r => mode === 'net' ? r.abort() : mode === '500' ? r.fulfill({ status: 500, body: 'x' }) : mode === 'bad' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"a":1}' })
    : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ name: 'عسل آزمون', prices: { price: '25000000', currency_minor_unit: 0, currency_code: 'IRR' }, is_in_stock: true, sku: 's1', permalink: 'https://www.asalereza.com/p' }]) }));
  const sync = () => p.evaluate(async () => { await syncCatalog(true); const d = CATALOG_DOC(); return { n: (d.items || []).length, err: d.err || '', price: ((d.items || [])[0] || {}).price, toast: document.getElementById('toast').textContent }; });
  await p.evaluate(async () => { const P = S.meta.find(x => x.id === 'profile') || { id: 'profile', created: nowTs() }; await putRaw('meta', { ...P, site: 'www.asalereza.com', updated: nowTs() }); });
  let r = await sync(); assert(r.n === 1 && !r.err && r.price === 2500000, 'ok: ' + JSON.stringify(r));
  for (const m of ['net', '500', 'bad']) { mode = m; r = await sync(); assert(r.n === 1 && r.err && /ممکن نشد/.test(r.toast), m + ': ' + JSON.stringify(r)); }
  assert(!o.errors.length, o.errors.join(' | '));
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
