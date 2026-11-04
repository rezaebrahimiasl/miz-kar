// Purchase entry from every path ends in the same, consistent books: «خرید کالا» (buyNew), from a person (buyFrom), the stock-in
// form switching to the purchase form (lot2buy), the stock-in form itself when documents are off (formLotSave: cash, credit, not
// in the books), and a double tap. Each path: exactly the expected lot(s), money rows and no duplicate; accounting invariants hold.
// Synthetic data only.
const { serve, launch, openApp, settle, invariants, fill, submitForm, test, run, assert } = require('./lib');
let srv, o, p;
const counts = () => p.evaluate(() => ({ lots: S.lots.filter(x => !x.void).length, led: S.ledger.filter(x => !x.void).length, docs: S.docs.filter(x => !x.void).length }));
const delta = (a, b) => ({ lots: b.lots - a.lots, led: b.led - a.led, docs: b.docs - a.docs });
const inv = async what => { const v = await invariants(p); assert(!v.length, what + ': ' + v.join('; ')); };

test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs(); for (const [id, name] of [['s1', 'فروشندهٔ آزمون'], ['s2', 'تأمین‌کنندهٔ دوم']]) await putRaw('people', { id, name, created: n, updated: n });
    await putRaw('meta', { id: 'accts', a: { 'بانک الف': { open: 500e6, openDate: '2026-09-23', setAt: n } }, created: n, updated: n }); render(); }); });

test('«خرید کالا» and «خرید از این شخص» open the same purchase form (not an invoice), with the person when given', async () => {
  for (const [act, data, pid] of [['buyNew', {}, ''], ['buyFrom', { person: 's2' }, 's2']]) {
    await p.evaluate(([act, data]) => { closeSheet(); const b = document.createElement('button'); b.dataset.act = act; Object.assign(b.dataset, data); document.body.appendChild(b); b.click(); b.remove(); }, [act, data]);
    await p.waitForSelector('#sheetRoot form[data-form=doc]');
    const r = await p.evaluate(() => ({ ty: document.getElementById('f_dty') && document.getElementById('f_dty').value, pid: (document.getElementById('f_person') || {}).value || '' }));
    assert(r.ty === 'purchase' && r.pid === pid, act + ': ' + JSON.stringify(r));
  }
  await p.evaluate(() => closeSheet());
});

test('stock-in form, choosing «خرید»: the purchase form opens with the product filled; one document, lot and payable', async () => {
  const c0 = await counts();
  await p.evaluate(() => { closeSheet(); formLot({}); });
  await p.waitForSelector('#sheetRoot form[data-form=lot]');
  await fill(p, { f_prod: 'عسل', f_var: 'گون' }); await p.evaluate(() => { const s = document.getElementById('f_src'); s.value = 'buy'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForSelector('#sheetRoot form[data-form=doc]');
  const desc = await p.evaluate(() => document.querySelector('#ditems .di_d').value); assert(/عسل/.test(desc) && /گون/.test(desc), 'product not carried: ' + desc);
  await p.evaluate(() => { const set = (sel, v) => { const e = document.querySelector('#ditems ' + sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }; set('.di_q', '۵'); set('.di_p', '۲');
    const ps = document.getElementById('f_person'); ps.value = 's1'; ps.dispatchEvent(new Event('change', { bubbles: true })); const l = document.getElementById('f_dled'); l.value = 'payable'; l.dispatchEvent(new Event('change', { bubbles: true })); });
  await submitForm(p); await settle(p);
  const d = delta(c0, await counts()); assert(d.docs === 1 && d.lots === 1 && d.led === 1, 'lot2buy: ' + JSON.stringify(d));
  await inv('lot2buy');
});

test('stock-in form with documents off: cash → lot + paid row; credit → lot + payable; «not in the books» → lot only; books balance', async () => {
  const setMods = m => p.evaluate(async m => { const P = S.meta.find(x => x.id === 'profile') || { id: 'profile', created: nowTs() }; await putRaw('meta', { ...P, mods: m, updated: nowTs() }); }, m);
  const mods0 = await p.evaluate(() => (S.meta.find(x => x.id === 'profile') || {}).mods || null);
  await setMods(['acc', 'apiary', 'cheques', 'clinic', 'deals', 'ibadat', 'recurs', 'stock', 'trips', 'wins']);   // everything except documents
  try {
    for (const [pay, led] of [['cash', 1], ['credit', 1], ['none', 0]]) {
      const c0 = await counts();
      await p.evaluate(() => { closeSheet(); formLot({}); }); await p.waitForSelector('#sheetRoot form[data-form=lot]');
      await fill(p, { f_prod: 'عسل', f_var: 'کنار ' + pay, f_lqty: '۸' });
      await p.evaluate(() => { const s = document.getElementById('f_src'); s.value = 'buy'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await p.waitForTimeout(100); assert(await p.evaluate(() => !!document.querySelector('#sheetRoot form[data-form=lot]')), 'left the stock-in form with documents off');
      const f = { f_lcost: '۱', f_lpay: pay }; if (await p.evaluate(() => !!document.getElementById('f_sup'))) f.f_sup = 's2';
      await fill(p, f); if (pay === 'cash' && await p.evaluate(() => !!document.getElementById('f_lacct'))) await fill(p, { f_lacct: 'بانک الف' });
      await submitForm(p); await settle(p);
      const d = delta(c0, await counts()); assert(d.lots === 1 && d.led === led && d.docs === 0, pay + ': ' + JSON.stringify(d));
      if (pay !== 'none') { await inv('stock-in ' + pay); continue; }
      // «در حساب‌ها ثبت نشود» (current behaviour, owner decision DEC-2): the lot counts in stock value but not in the inventory
      // account; the integrity page reports exactly that. The synthetic lot is then voided so the next checks start balanced.
      const v = await invariants(p); assert(v.length === 1 && /stock value 8000000 ≠ inventory account/.test(v[0].replace(/(\d+) ≠ inventory account (\d+)/, (m, a, b) => (a - b) + ' ≠ inventory account')), 'not-in-books: ' + v.join('; '));
      assert(await p.evaluate(() => integCheck().groups.some(g => g.k === 'books' && g.items.some(x => /موجودی انبار/.test(x.lbl)))), 'integrity page does not report it');
      await p.evaluate(async () => { const l = S.lots.filter(x => !x.void).pop(); await save('lots', l.id, { void: true }); }); await settle(p); await inv('after voiding the synthetic lot');
    }
  } finally { await setMods(mods0); }
});

test('a purchase saved through the form (the path all three entries share), double-tapped: one document, one lot, one payable', async () => {
  const c0 = await counts();
  await p.evaluate(() => { closeSheet(); formDoc({ type: 'purchase', inv: false, personId: 's1', led: 'payable', items: [{ desc: 'عسل دوبار', qty: 3, unit: 'کیلو', price: 1e6 }] }); });
  await p.waitForSelector('#sheetRoot form[data-form=doc]');
  await p.evaluate(() => { const f = document.querySelector('#sheetRoot form[data-form=doc]'); const b = f.querySelector('button[type=submit]') || [...f.querySelectorAll('button.pri:not([type=button])')].pop(); b.click(); b.click(); });
  await p.waitForTimeout(800); await settle(p);
  const d = delta(c0, await counts()); assert(d.docs === 1 && d.lots === 1 && d.led === 1, 'double tap: ' + JSON.stringify(d));
  await inv('double tap'); assert(!o.errors.length, o.errors.join(' | '));
});

// The scenario of the final review: the first save is still running (posting held open), more than 20 s pass, the user taps «ثبت»
// again, then the first save completes. Expected: exactly one document, one lot, one payable — at the form level (the lock does not
// expire) and at the operation level (the same form never creates a second document, even when the form lock is bypassed).
const slowPurchase = async () => { await p.evaluate(() => { closeSheet(); formDoc({ type: 'purchase', inv: false, personId: 's1', led: 'payable', items: [{ desc: 'عسل کند', qty: 2, unit: 'کیلو', price: 1e6 }] }); });
  await p.waitForSelector('#sheetRoot form[data-form=doc]');
  // hold the first posting open until released (as a very slow phone or a long dialog would)
  await p.evaluate(() => { window._pdReal = window.postDoc; window._gate = new Promise(r => { window._open = r; }); window._calls = 0;
    window.postDoc = async (...a) => { window._calls++; if (window._calls === 1) await window._gate; return window._pdReal(...a); }; }); };
const tapSave = () => p.evaluate(() => { const f = document.querySelector('#sheetRoot form[data-form=doc]'); (f.querySelector('button[type=submit]') || [...f.querySelectorAll('button.pri:not([type=button])')].pop()).click(); });

test('first save still running, more than 20 s pass, «ثبت» again, then the first completes: one document (form lock)', async () => {
  const c0 = await counts(); await slowPurchase();
  await tapSave(); await p.waitForFunction(() => window._calls === 1);
  await p.evaluate(() => { const f = document.querySelector('#sheetRoot form[data-form=doc]'); f.dataset.busy = String(Date.now() - 21000); });   // 21 s later
  await tapSave(); await p.waitForTimeout(200);
  const msg = await p.evaluate(() => document.getElementById('toast').textContent);
  await p.evaluate(() => window._open()); await p.waitForTimeout(400); await settle(p); await p.evaluate(() => { window.postDoc = window._pdReal; });
  const d = delta(c0, await counts()); assert(d.docs === 1 && d.lots === 1 && d.led === 1, 'after the long wait: ' + JSON.stringify(d));
  assert(/هنوز تمام نشده/.test(msg), 'no explanation on the late tap: ' + msg);
  await inv('long wait, form lock');
});

test('the same with the form lock bypassed: the operation itself refuses a second document from the same form', async () => {
  const c0 = await counts(); await slowPurchase();
  await tapSave(); await p.waitForFunction(() => window._calls === 1);
  await p.evaluate(() => { delete document.querySelector('#sheetRoot form[data-form=doc]').dataset.busy; });   // no form lock at all
  await tapSave(); await p.waitForTimeout(300);
  await p.evaluate(() => window._open()); await p.waitForTimeout(400); await settle(p);
  // and once more after the first finished
  if (await p.evaluate(() => !!document.querySelector('#sheetRoot form[data-form=doc]'))) { await tapSave(); await p.waitForTimeout(300); await settle(p); }
  await p.evaluate(() => { window.postDoc = window._pdReal; });
  const d = delta(c0, await counts()); assert(d.docs === 1 && d.lots === 1 && d.led === 1, 'operation level: ' + JSON.stringify(d));
  await inv('operation level'); assert(!o.errors.length, o.errors.join(' | '));
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
