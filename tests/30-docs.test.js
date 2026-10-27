// Document versions and restore (D1 regression tests). Synthetic data only.
const { serve, launch, openApp, openDoc, submit, seedSmall, test, run, assert } = require('./lib');
let srv, o, lot;
const state = p => p.evaluate(lot => ({
  live: S.docs.filter(d => d.type === 'invoice' && !d.void).map(d => d.items[0].qty),
  rem: lotStat(byId('lots', lot)).rem,
  rec: S.ledger.filter(l => !l.void && l.kind === 'receivable').reduce((a, l) => a + Number(l.amount), 0) / 1e6,
  orphan: S.docs.filter(d => !d.void && S.docs.some(n => !n.void && n.redoOf === d.id)).length }), lot);

test('setup: purchase 100 kg, sell 10, edit sale to 12', async () => {
  srv = await serve(); o = await launch(); await openApp(o, srv.url); lot = await seedSmall(o.page);
  await openDoc(o.page, { type: 'invoice', personId: 'p_a', date: '2026-10-02', led: 'receivable', items: [{ desc: 'عسل آزمون', qty: 10, unit: 'کیلو', price: 1e6, src: 'lot', lotId: lot }] }); await submit(o.page);
  const v1 = await o.page.evaluate(() => S.docs.find(d => d.type === 'invoice' && !d.void).id);
  await o.page.evaluate(id => { closeSheet(); const d = byId('docs', id); const { id: _i, posted, void: _v, created, updated, ...cp } = d; formDoc({ ...cp, inv: d.inv, redoOf: id }); }, v1);
  await o.page.waitForSelector('#sheetRoot form[data-form=doc]');
  await o.page.evaluate(() => { const q = document.querySelector('#ditems .di_q'); q.value = '12'; q.dispatchEvent(new Event('input', { bubbles: true })); });
  await submit(o.page);
  const s = await state(o.page); assert(JSON.stringify(s.live) === '[12]' && s.rem === 88 && s.rec === 12, JSON.stringify(s));
});

test('R-D1a «برگرداندن این نسخه» opens a form and changes nothing before save', async () => {
  const [v1, v2] = await o.page.evaluate(() => { const L = S.docs.filter(d => d.type === 'invoice'); return [L.find(d => d.void).id, L.find(d => !d.void).id]; });
  await o.page.evaluate(id => { closeSheet(); viewDoc(id); }, v2);
  await o.page.evaluate(v1 => { const d = document.querySelector('#sheetRoot details'); if (d) d.open = true;
    const b = document.querySelector(`[data-id="${v1}"][data-act$="Restore"]`); b.click(); }, v1);
  await o.page.waitForFunction(() => true);
  const formOpen = await o.page.waitForSelector('#sheetRoot form[data-form=doc]', { timeout: 3000 }).then(() => true).catch(() => false);
  const s = await state(o.page);
  assert(JSON.stringify(s.live) === '[12]' && s.rem === 88 && s.rec === 12, 'data changed before save: ' + JSON.stringify(s));
  assert(formOpen, 'no form opened (the button ran the void-restore action)');
  assert(await o.page.evaluate(v2 => document.querySelector('#sheetRoot form[data-form=doc]').dataset.redo === v2, v2), 'form is not a replacement of the current version');
});

test('R-D1a after saving the restored version exactly one version is live', async () => {
  assert(await o.page.$('#sheetRoot form[data-form=doc]'), 'no restore form to save (see previous test)');
  await submit(o.page); const s = await state(o.page);
  assert(JSON.stringify(s.live) === '[10]' && s.rem === 90 && s.rec === 10 && s.orphan === 0, JSON.stringify(s));
});

test('R-D1b count sheet: void then «برگرداندن برگه» restores sheet and lot', async () => {
  await o.page.evaluate(async () => { const now = nowTs();
    await putRaw('docs', { id: 'cnt_t', type: 'count', no: 'T-1', date: '2026-10-03', items: [{ desc: 'x' }], status: 'posted', posted: true, void: false, created: now, updated: now });
    await putRaw('lots', { id: 'lot_cnt', docId: 'cnt_t', product: 'عسل', variety: 'شمارش', source: 'open', qty: 7, unit: 'کیلو', cost: 1e6, currency: 'تومان', date: '2026-10-03', void: false, created: now, updated: now });
    document.getElementById('sheetRoot').dataset.dirty = ''; closeSheet(); viewCount('cnt_t'); });
  // first tap arms the button («مطمئنی؟»), second tap voids
  await o.page.evaluate(() => document.querySelector('#sheetRoot [data-act=docDel]').click());
  await o.page.waitForFunction(() => document.querySelector('#sheetRoot [data-act=docDel]').dataset.sure === '1');
  await o.page.evaluate(() => document.querySelector('#sheetRoot [data-act=docDel]').click());
  await o.page.waitForFunction(() => byId('docs', 'cnt_t').void && byId('lots', 'lot_cnt').void);
  await o.page.evaluate(() => { closeSheet(); viewCount('cnt_t'); }); await o.page.evaluate(() => document.querySelector('#sheetRoot [data-act=docRestore]').click());
  await o.page.waitForFunction(() => !byId('docs', 'cnt_t').void && !byId('lots', 'lot_cnt').void, null, { timeout: 4000 });
});

test('R-D1d invariant: no live document is the predecessor of another live document', async () => {
  assert((await state(o.page)).orphan === 0, 'orphan live versions found');
});

test('no page errors and no external network', async () => {
  assert(!o.errors.length, o.errors.join(' | ')); assert(!o.net.external.length, o.net.external.join(' | '));
  await o.ctx.close(); srv.close();
});
run(__filename);
