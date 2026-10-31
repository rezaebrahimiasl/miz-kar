// Unusual-price warnings on lots (lotSuspect): another variety is not a reference; the user can confirm a legitimate cost
// («این قیمت درست است»), the confirmation is stored on the lot and holds while the cost stays within 10% (same currency and
// unit); a material change warns again; a 50× gap is labelled a likely typing/unit error. No price or record is changed by
// the check. Synthetic data only.
const { serve, launch, openApp, settle, test, run, assert } = require('./lib');
let srv, o, p;
const lot = (id, variety, cost, extra = {}) => ({ id, product: 'زعفران آزمون', variety, unit: 'کیلو', qty: 10, cost, currency: 'تومان', source: 'buy', date: '2026-10-01', ...extra });
const put = (p, L) => p.evaluate(async L => { for (const l of L) { const n = nowTs(); await putRaw('lots', { ...l, created: n, updated: n }); } }, L);
const sus = (p, id) => p.evaluate(id => { const r = lotSuspect(byId('lots', id)); return r ? { err: !!r.err } : null; }, id);
async function act(p, a, id) { await p.evaluate(([a, id]) => { const b = document.createElement('button'); b.dataset.act = a; b.dataset.id = id; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); }, [a, id]); }

test('setup', async () => { srv = await serve(); o = await launch(); p = o.page; await openApp(o, srv.url); });

test('another variety is not a reference: a premium and a plain variety 10× apart are not flagged; the same variety is', async () => {
  await put(p, [lot('pv1', 'ممتاز', 100e6, { date: '2026-10-02' }), lot('pv2', 'معمولی', 10e6)]);
  assert(!(await sus(p, 'pv1')) && !(await sus(p, 'pv2')), 'different varieties flagged each other');
  await put(p, [lot('pv3', 'ممتاز', 10e6, { date: '2026-10-03' })]);
  assert(await sus(p, 'pv3'), 'same variety 10× apart is not flagged');
});

test('«این قیمت درست است»: confirmed cost stops the warning, is stored on the lot, nothing else changes; a material change warns again', async () => {
  const before = await p.evaluate(() => JSON.stringify(S.lots.map(l => [l.id, l.cost, l.qty])));
  assert(await p.evaluate(() => vStock().includes('data-act="lotPriceOk" data-id="pv3"')), 'stock page offers no confirm action');
  await act(p, 'lotPriceOk', 'pv3'); await p.waitForSelector('#dlgRoot:not([hidden]) [data-dv=ok]'); await p.click('#dlgRoot [data-dv=ok]'); await settle(p);
  const r = await p.evaluate(() => ({ ok: byId('lots', 'pv3').priceOk, s: lotSuspect(byId('lots', 'pv3')), lots: JSON.stringify(S.lots.map(l => [l.id, l.cost, l.qty])) }));
  assert(r.ok && r.ok.cost === 10e6 && !r.s && r.lots === before, 'confirmation not stored or records changed: ' + JSON.stringify(r));
  // survives a reload (persisted)
  await p.reload(); await settle(p); assert(!(await sus(p, 'pv3')), 'confirmation lost after reload');
  // within 10%: still confirmed; beyond: warns again
  await p.evaluate(() => save('lots', 'pv3', { cost: 10.5e6 })); await settle(p); assert(!(await sus(p, 'pv3')), 'a 5% change dropped the confirmation');
  await p.evaluate(() => save('lots', 'pv3', { cost: 13e6 })); await settle(p); assert(await sus(p, 'pv3'), 'a 30% change was not re-checked');
  await p.evaluate(() => save('lots', 'pv3', { cost: 10e6, currency: 'دلار' })); await settle(p);
  assert(!(await p.evaluate(() => lotPriceOk(byId('lots', 'pv3')))), 'confirmation held across a currency change');
});

test('a 50× gap is labelled a likely data error, a 5× gap only unusual; cancelling the confirm stores nothing', async () => {
  await put(p, [lot('pe0', 'سوم', 10e6, { date: '2026-10-03' }), lot('pe1', 'سوم', 600e6, { date: '2026-10-04' })]); const a = await sus(p, 'pe1');
  await put(p, [lot('pe2', 'سوم', 3e9, { date: '2026-10-05' })]); const b = await sus(p, 'pe2');
  assert(a && a.err && b && !b.err, 'error vs unusual: ' + JSON.stringify({ a, b }));
  assert(await p.evaluate(() => vStock().includes('خطای ورود')), 'error label not shown');
  await act(p, 'lotPriceOk', 'pe1'); await p.waitForSelector('#dlgRoot:not([hidden]) [data-dv=no]'); await p.click('#dlgRoot [data-dv=no]'); await settle(p);
  assert(!(await p.evaluate(() => byId('lots', 'pe1').priceOk)), 'cancel stored a confirmation');
  assert(!o.errors.length, o.errors.join(' | '));
});

test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
