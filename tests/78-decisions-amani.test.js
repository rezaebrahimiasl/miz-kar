// 4.47: «تصمیم‌های حسابداری» explains DEC-1/2/3 and records the owner's answer only (no record changes);
// returning consigned/borrowed goods: «پس دادم» preselects the oldest amani lot with stock and its owner, lists only amani lots,
// and the lot page offers «پس دادن به صاحبش». Synthetic data.
const { serve, launch, openApp, settle, fill, invariants, test, run, assert } = require('./lib');
let srv, o, p;
test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs(); await putRaw('people', { id: 'own', name: 'صاحب امانی', created: n, updated: n });
    await putRaw('lots', { id: 'LA', product: 'عسل', variety: 'امانی', qty: 5, unit: 'عدد', cost: 1e6, currency: 'تومان', date: '2026-10-01', code: '901', source: 'loan', supplierId: 'own', created: n, updated: n });
    await putRaw('lots', { id: 'LM', product: 'عسل', variety: 'خودم', qty: 9, unit: 'عدد', cost: 1e6, currency: 'تومان', date: '2026-09-01', code: '902', source: 'open', created: n, updated: n }); });
  await p.reload(); await settle(p); });

test('decisions page: answers are recorded and change no record', async () => {
  const before = await p.evaluate(() => JSON.stringify([S.ledger.length, S.lots.length, S.moves.length, S.docs.length]));
  await p.evaluate(() => decideSheet()); await p.waitForSelector('#sheetRoot [data-act=decSet]');
  const n = await p.evaluate(() => document.querySelectorAll('#sheetRoot [data-act=decSet]').length); assert(n === 9, 'nine options, got ' + n);
  await p.click('#sheetRoot [data-act=decSet][data-v="DEC2:b"]'); await settle(p);
  const r = await p.evaluate(() => ({ v: decOf('DEC2'), v1: decOf('DEC1'), pressed: document.querySelector('#sheetRoot [data-v="DEC2:b"]').getAttribute('aria-pressed'), after: JSON.stringify([S.ledger.length, S.lots.length, S.moves.length, S.docs.length]) }));
  assert(r.v === 'b' && r.v1 === '' && r.pressed === 'true' && r.after === before, JSON.stringify(r));
  await p.reload(); await settle(p); assert(await p.evaluate(() => decOf('DEC2')) === 'b', 'answer kept after reload');
  const sub = await p.evaluate(() => DECS.filter(d => !decOf(d.k)).length);
  assert(sub === 2, 'two questions still open: ' + sub);
});

test('returning amani goods: preselected lot and owner, only amani lots listed, lot page shortcut', async () => {
  await p.evaluate(() => { closeSheet(); newDocSheet(); }); await settle(p); await p.click('#sheetRoot [data-act=amaniPick]'); await settle(p); await p.click('#sheetRoot [data-act=amaniDo][data-v=payback]');
  await p.waitForSelector('#sheetRoot #f_mlot', { state: 'attached' });
  const r = await p.evaluate(() => ({ k: document.getElementById('f_mk').value, lot: document.getElementById('f_mlot').value, opts: [...document.getElementById('f_mlot').options].map(o => o.value), person: document.getElementById('f_person').value }));
  assert(r.k === 'payback' && r.lot === 'LA' && JSON.stringify(r.opts) === '["LA"]' && r.person === 'own', JSON.stringify(r));
  await fill(p, { f_mqty: '۱' });
  await p.evaluate(() => { const f = document.querySelector('#sheetRoot form'); (f.querySelector('button[type=submit]') || [...f.querySelectorAll('button.pri:not([type=button])')].pop()).click(); });
  await p.waitForTimeout(500); await settle(p);
  const m = await p.evaluate(() => ({ mv: S.moves.filter(x => !x.void && x.lotId === 'LA').map(x => x.kind + ':' + x.qty + ':' + x.personId), rem: lotStat(byId('lots', 'LA')).rem }));
  assert(JSON.stringify(m.mv) === '["payback:1:own"]' && m.rem === 4, JSON.stringify(m));
  const v = await invariants(p); assert(!v.length, v.join('; '));
  await p.evaluate(() => { closeSheet(); viewLot('LA'); }); await settle(p);
  const has = await p.evaluate(() => !!document.querySelector('#sheetRoot [data-act=newMove][data-kind=payback][data-lot=LA][data-person=own]'));
  const hasOwn = await p.evaluate(() => { closeSheet(); viewLot('LM'); return !!document.querySelector('#sheetRoot [data-kind=payback]'); });
  assert(has && !hasOwn, 'lot page shortcut: amani ' + has + ', own ' + hasOwn);
});

test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
