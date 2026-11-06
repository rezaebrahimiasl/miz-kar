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
  assert(r === 1, 'success: lot with one payable, got ' + r); assert(await p.evaluate(() => document.getElementById('sheetRoot').hidden), 'sheet not closed after the commit'); const v = await invariants(p); assert(!v.length, v.join('; '));
});

test('LOT-1 the supplier\'s quote follow-up is closed only when the lot really saved', async () => {
  await p.evaluate(async () => { const n = nowTs(); await putRaw('tasks', { id: 'tq', title: 'تصمیم خرید', personId: 's1', status: 'open', flow: { kind: 'quote_got', personId: 's1', product: 'عسل' }, created: n, updated: n }); });
  const go = async () => { await p.evaluate(() => { closeSheet(); formLot({}); }); await p.waitForSelector('#sheetRoot form[data-form=lot]');
    await fill(p, { f_prod: 'عسل', f_var: 'پیشنهاد', f_lqty: '۲' }); await p.evaluate(() => { const s = document.getElementById('f_src'); s.value = 'buy'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await fill(p, { f_lcost: '۱', f_lpay: 'credit', f_sup: 's1' }); };
  await go(); await failAt('ledger'); await tapSave(); await p.waitForTimeout(400); await settle(p); await failAt(null);
  assert(await p.evaluate(() => byId('tasks', 'tq').status === 'open'), 'follow-up closed by a failed save');
  await go(); await tapSave(); await p.waitForTimeout(400); await settle(p);
  assert(await p.evaluate(() => byId('tasks', 'tq').status !== 'open'), 'follow-up not closed after the save');
});

test('LOT-1 edit open → buy with a cost: a failure at the lot leaves no payable; success writes both', async () => {
  const open = async () => { await p.evaluate(() => { closeSheet(); formLot(byId('lots', 'LO')); }); await p.waitForSelector('#sheetRoot form[data-form=lot]');
    await p.evaluate(() => { const s = document.getElementById('f_src'); s.value = 'buy'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await fill(p, { f_lcost: '۲', f_sup: 's1' }); };
  // Messages are recorded so a side message («بدهی پولی … ثبت شد») can be checked: never before/without the commit.
  await p.evaluate(() => { window._tl = []; if (!window._t0) { window._t0 = toast; window.toast = m => { window._tl.push(String(m)); return window._t0(m); }; } });
  await open(); await failAt('lots'); await same('edit failure', tapSave); await failAt(null);
  const tf = await p.evaluate(() => window._tl.splice(0)); assert(!tf.some(m => /ثبت شد/.test(m)) && tf.some(m => /ذخیره نشد/.test(m)), 'failed save showed a success message: ' + JSON.stringify(tf));
  await open(); await tapSave(); await p.waitForTimeout(400); await settle(p);
  const ts = await p.evaluate(() => window._tl.splice(0)); assert(ts.length === 1 && /ذخیره شد/.test(ts[0]) && /بدهی پولی/.test(ts[0]), 'success messages: ' + JSON.stringify(ts));
  const r = await p.evaluate(() => ({ src: byId('lots', 'LO').source, pay: S.ledger.filter(x => !x.void && x.lotId === 'LO').length }));
  assert(r.src === 'buy' && r.pay === 1, JSON.stringify(r)); const v = await invariants(p); assert(!v.length, v.join('; '));
});

// LOT-2 review: local mode is one operation (a failure leaves nothing, so no side message); cloud mode writes one record at a time,
// so when the lot write fails after a money row was written, that row is still reported together with the failure — never hidden,
// and no success message for the lot. Cloud writes go to a synthetic stand-in (no real cloud).
const cloudRun = (failCol, lid) => p.evaluate(async ([failCol, lid]) => { const realDb = db, calls = []; window._tl = [];
  const w = c => async () => { calls.push(c); if (c === failCol) throw new Error('synthetic cloud failure'); };
  db = { collection: c => ({ doc: () => ({ update: w(c), set: w(c) }) }) }; mode = 'cloud';
  try { const f = document.querySelector('#sheetRoot form[data-form=lot]'); await formLotSave(f, lid === undefined ? (f.dataset.id || 'LO') : lid); } finally { mode = 'local'; db = realDb; }
  return { calls, msgs: window._tl.splice(0), open: !document.getElementById('sheetRoot').hidden }; }, [failCol, lid]);
const noLotSuccess = m => !m.some(x => /^(ذخیره شد|محموله [۰-۹0-9]+ ثبت شد)/.test(x));
test('LOT-2 amount correction of a bought lot: local failure shows nothing as saved; success reports the correction', async () => {
  const open = async () => { await p.evaluate(() => { closeSheet(); formLot(byId('lots', 'LO')); }); await p.waitForSelector('#sheetRoot form[data-form=lot]'); await fill(p, { f_lcost: '۳' }); };
  await open(); await failAt('lots'); await same('local amount failure', tapSave); await failAt(null);
  let m = await p.evaluate(() => window._tl.splice(0)); assert(noLotSuccess(m) && !m.some(x => /مبلغ خرید/.test(x)) && m.some(x => /ذخیره نشد/.test(x)), 'local failure messages: ' + JSON.stringify(m));
  await open(); await tapSave(); await p.waitForTimeout(400); await settle(p);
  m = await p.evaluate(() => window._tl.splice(0)); assert(m.length === 1 && /ذخیره شد/.test(m[0]) && /مبلغ خرید/.test(m[0]), 'local success messages: ' + JSON.stringify(m));
  const v = await invariants(p); assert(!v.length, v.join('; '));
});
test('LOT-2 cloud: the money row written before a failed lot write is reported with the failure (amount correction and new payable)', async () => {
  // amount correction: the ledger update succeeds, the lot update fails
  await p.evaluate(() => { closeSheet(); formLot(byId('lots', 'LO')); }); await p.waitForSelector('#sheetRoot form[data-form=lot]'); await fill(p, { f_lcost: '۴' });
  let r = await cloudRun('lots'); let last = r.msgs[r.msgs.length - 1] || '';
  assert(r.calls.includes('ledger') && r.calls.includes('lots') && noLotSuccess(r.msgs) && /ذخیره نشد/.test(last) && /مبلغ خرید/.test(last), 'cloud amount: ' + JSON.stringify(r));
  // new payable: an open lot turned into a bought one; the payable is written, the lot write fails
  await p.evaluate(async () => { const n = nowTs(); await putRaw('lots', { id: 'LC', product: 'عسل', variety: 'ابری', qty: 4, unit: 'کیلو', cost: 1e6, currency: 'تومان', date: '2026-10-02', code: '802', source: 'open', created: n, updated: n }); });
  await p.evaluate(() => { closeSheet(); formLot(byId('lots', 'LC')); }); await p.waitForSelector('#sheetRoot form[data-form=lot]');
  await p.evaluate(() => { const s = document.getElementById('f_src'); s.value = 'buy'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await fill(p, { f_lcost: '۲', f_sup: 's1' });
  r = await p.evaluate(() => { const f = document.querySelector('#sheetRoot form[data-form=lot]'); f.dataset.id = 'LC'; return 1; }).then(() => cloudRun('lots')); last = r.msgs[r.msgs.length - 1] || '';
  assert(r.calls.includes('ledger') && r.calls.includes('lots') && noLotSuccess(r.msgs) && /ذخیره نشد/.test(last) && /بدهی پولی/.test(last), 'cloud payable: ' + JSON.stringify(r));
  // the payable write fails: the save stops (the lot is not written either) and nothing is claimed as recorded
  await p.evaluate(() => { closeSheet(); formLot(byId('lots', 'LC')); }); await p.waitForSelector('#sheetRoot form[data-form=lot]');
  await p.evaluate(() => { const s = document.getElementById('f_src'); s.value = 'buy'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await fill(p, { f_lcost: '۲', f_sup: 's1' });
  await p.evaluate(() => { document.querySelector('#sheetRoot form[data-form=lot]').dataset.id = 'LC'; }); r = await cloudRun('ledger');
  last = r.msgs[r.msgs.length - 1] || '';
  assert(!r.calls.includes('lots') && noLotSuccess(r.msgs) && !r.msgs.some(x => /بدهی پولی/.test(x)) && /محموله ذخیره نشد/.test(last) && !/پیش از آن ثبت شد/.test(last), 'cloud first write fails (the lot must not be written either): ' + JSON.stringify(r));
});

test('LOT-2 cloud: the lot is written but a later money row fails (packing cost; purchase payable) — the message says exactly that', async () => {
  // packing: an existing bought lot whose packing row no longer matches; the lot update succeeds, the packing row fails
  await p.evaluate(async () => { const n = nowTs(); await putRaw('lots', { id: 'LP', product: 'عسل', variety: 'بسته', qty: 2, unit: 'کیلو', cost: 1e6, currency: 'تومان', date: '2026-10-03', code: '803', source: 'buy', supplierId: 's1', created: n, updated: n });
    await putRaw('ledger', { id: 'LPK', pack: true, lotId: 'LP', kind: 'paid', amount: 1e5, currency: 'تومان', about: 'بسته‌بندی آزمون', category: 'خرید و تأمین کالا', date: '2026-10-03', settled: false, void: false, created: n, updated: n }); });
  await p.evaluate(() => { closeSheet(); formLot(byId('lots', 'LP')); }); await p.waitForSelector('#sheetRoot form[data-form=lot]');
  let r = await cloudRun('ledger', 'LP'); let last = r.msgs[r.msgs.length - 1] || '';
  assert(r.calls[0] === 'lots' && r.calls.includes('ledger') && noLotSuccess(r.msgs) && /^محموله ثبت شد، ولی هزینهٔ بسته‌بندی ثبت نشد/.test(last) && !/ذخیره نشد/.test(last) && !r.open, 'cloud packing after lot: ' + JSON.stringify(r));
  // purchase payable: a new bought lot on credit; the lot is written, the payable fails
  await p.evaluate(() => { closeSheet(); formLot({}); }); await p.waitForSelector('#sheetRoot form[data-form=lot]');
  await fill(p, { f_prod: 'عسل', f_var: 'ابری‌نو', f_lqty: '۳' }); await p.evaluate(() => { const s = document.getElementById('f_src'); s.value = 'buy'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await fill(p, { f_lcost: '۱', f_lpay: 'credit', f_sup: 's1' });
  r = await cloudRun('ledger', null); last = r.msgs[r.msgs.length - 1] || '';
  assert(r.calls[0] === 'lots' && r.calls.includes('ledger') && noLotSuccess(r.msgs) && /^محموله ثبت شد، ولی بدهی خرید ثبت نشد/.test(last) && !r.open, 'cloud payable after lot: ' + JSON.stringify(r));
  // before the lot (unchanged rule): the lot write itself fails → «محموله ذخیره نشد», the sheet stays open
  await p.evaluate(() => { closeSheet(); formLot({}); }); await p.waitForSelector('#sheetRoot form[data-form=lot]');
  await fill(p, { f_prod: 'عسل', f_var: 'ابری‌دو', f_lqty: '۳' }); await p.evaluate(() => { const s = document.getElementById('f_src'); s.value = 'buy'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await fill(p, { f_lcost: '۱', f_lpay: 'credit', f_sup: 's1' });
  r = await cloudRun('lots', null); last = r.msgs[r.msgs.length - 1] || '';
  assert(!r.calls.includes('ledger') && /^محموله ذخیره نشد/.test(last) && r.open, 'cloud lot fails first: ' + JSON.stringify(r));
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
