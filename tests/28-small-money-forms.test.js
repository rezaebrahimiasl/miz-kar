// WP-10 (second group): the remaining submit branches that write ledger rows — ledger (new and correction), ledgerEdit,
// void, pendEdit, comm, lotExtra, move (sale from a lot), moveEdit, repack, voidMove (of that packing), prod, recur,
// voucher (from a ledger row) — through the real forms on synthetic records: exact rows and invariants after each.
const { serve, launch, openApp, settle, invariants, fill, submitForm, test, run, assert } = require('./lib');
let srv, o, p;
const D0 = '2026-10-01', BANK = 'بانک الف';
const inv = async what => { const v = await invariants(p); assert(!v.length, `${what}: invariants broken: ${v.join('; ')}`); };
const live = () => p.evaluate(() => JSON.parse(JSON.stringify(S.ledger.filter(l => !l.void))));
const added = async b => (await live()).filter(l => !b.some(x => x.id === l.id));
const L = id => p.evaluate(i => { const x = byId('ledger', i); return x ? JSON.parse(JSON.stringify(x)) : null; }, id);
const pick = vals => p.evaluate(vals => { for (const [id, v] of Object.entries(vals)) { const s = document.getElementById(id); if (!s) throw new Error('no field ' + id);
  if (s.tagName === 'SELECT' && ![...s.options].some(o => o.value === v)) s.add(new Option(v, v)); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); } }, vals);
const act = (a, data = {}, keep) => p.evaluate(([a, data, keep]) => { if (!keep) closeSheet(); const b = document.createElement('button'); b.type = 'button'; b.dataset.act = a; Object.assign(b.dataset, data);
  const r = document.getElementById('sheetRoot'); (r.hidden ? document.body : r).appendChild(b); b.click(); b.remove(); }, [a, data, keep]);
const openForm = async (fn, arg, sel) => { await p.evaluate(([fn, arg]) => { closeSheet(); window[fn](...arg); }, [fn, arg]); await p.waitForSelector(`#sheetRoot form[data-form=${sel}]`); };
const sub = async () => { await submitForm(p); await settle(p); };

test('setup: synthetic people, bank account, a bought lot and a package type', async () => {
  srv = await serve(); o = await launch(); p = o.page; await openApp(o, srv.url);
  await p.evaluate(async ([D0, BANK]) => { const n = nowTs(), b = { created: n, updated: n, void: false };
    for (const [id, name] of [['pc', 'مشتری آزمون'], ['ps', 'تأمین‌کنندهٔ آزمون'], ['pm', 'بازاریاب آزمون']]) await putRaw('people', { id, name, ...b });
    await putRaw('meta', { id: 'accts', a: { [BANK]: { open: 100e6, openDate: '2026-09-01' }, 'بانک ب': { open: 10e6, openDate: '2026-09-01' } }, ...b });
    await putRaw('meta', { id: 'profile', packs: [{ id: 'pk1', n: 'شیشهٔ یک‌کیلویی آزمون', w: 1, pc: 12 }], ...b });
    await putRaw('lots', { id: 'L1', product: 'عسل', variety: 'آزمون', source: 'buy', supplierId: 'ps', date: D0, qty: 40, unit: 'کیلو', cost: 1e6, code: 'T-1', currency: 'تومان', ...b });
    await putRaw('ledger', { id: 'g1', lotId: 'L1', kind: 'payable', personId: 'ps', amount: 40e6, currency: 'تومان', about: 'خرید آزمون (T-1)', category: 'خرید و تأمین کالا', instrument: 'نسیه', date: D0, due: '', settled: false, ...b });
    render(); }, [D0, BANK]);
  await inv('fixtures');
});

test('ledger: a new paid row; «اصلاح» writes the corrected row and voids the old one (corrOf)', async () => {
  let b = await live(); await openForm('formLedger', [{ kind: 'paid' }], 'ledger');
  await fill(p, { f_amt: '2', f_about: 'هزینهٔ آزمون' }); await pick({ f_acct: BANK, f_cat: 'شخصی: سایر' }); await sub();   // a personal expense (a goods category would need a lot)
  let r = await added(b); assert(r.length === 1 && r[0].kind === 'paid' && r[0].amount === 2e6 && r[0].acct === BANK && r[0].about === 'هزینهٔ آزمون', 'new: ' + JSON.stringify(r)); await inv('after new row');
  const old = r[0].id; b = await live(); await act('lgFix', { id: old }); await p.waitForSelector('#sheetRoot form[data-form=ledger] #f_fixof', { state: 'attached' });
  await fill(p, { f_amt: '2.5' }); await sub();
  r = await added(b); const o1 = await L(old);
  assert(r.length === 1 && r[0].amount === 2.5e6 && r[0].corrOf === old && o1.void && o1.voidReason === 'اصلاح شد', 'correction: ' + JSON.stringify({ r, o1: [o1.void, o1.voidReason] })); await inv('after correction');
});

test('ledgerEdit: changing the amount keeps a history entry; void: «باطل» with a reason', async () => {
  const id = (await live()).find(x => x.about === 'هزینهٔ آزمون').id;
  await openForm('formLedgerEdit', [await L(id)], 'ledgerEdit'); await fill(p, { f_amt: '3' }); await sub();
  let x = await L(id); assert(x.amount === 3e6 && JSON.stringify(x.hist.map(h => [h.from, h.to])) === JSON.stringify([[2.5e6, 3e6]]), 'edit: ' + JSON.stringify([x.amount, x.hist])); await inv('after ledgerEdit');
  await p.evaluate(i => { closeSheet(); viewLedger(i); }, id); await p.waitForSelector('#voidBox', { state: 'attached' }); await settle(p);
  await act('voidAsk', { id }, true); await p.waitForSelector('#sheetRoot form[data-form=void] #f_vr', { state: 'attached' });
  await fill(p, { f_vr: 'ثبت تکراری آزمون' }); await sub(); x = await L(id);
  assert(x.void && x.voidReason === 'ثبت تکراری آزمون', 'void: ' + JSON.stringify([x.void, x.voidReason])); await inv('after void');
});

test('pendEdit: confirming less than a pending automatic transfer splits the pair; the rest stays pending', async () => {
  await p.evaluate(async BANK => { const n = nowTs(); for (const [id, kind, acct] of [['q1', 'paid', BANK], ['q2', 'received', 'بانک ب']]) await putRaw('ledger', { id, pairId: 'P1', pending: true, kind, amount: 3e6, currency: 'تومان', acct, about: 'انتقال آزمون', date: today(), instrument: 'نقد/کارت', settled: false, void: false, created: n, updated: n }); }, BANK);
  const b = await live(); await act('pendEdit', { id: 'q1' }); await p.waitForSelector('#sheetRoot form[data-form=pendEdit]');
  await fill(p, { f_pam: '1' }); await sub();
  const r = await added(b), q1 = await L('q1'), q2 = await L('q2');
  assert(r.length === 2 && r.every(x => x.amount === 1e6 && !x.pending && x.partOf && x.pairId && x.pairId !== 'P1') && q1.amount === 2e6 && q2.amount === 2e6 && q1.pending && q2.pending, 'split: ' + JSON.stringify({ r: r.map(x => [x.kind, x.amount, x.partOf]), q1: [q1.amount, q1.pending], q2: [q2.amount, q2.pending] }));
  await inv('after pendEdit');
});

test('comm: paying a marketer writes one paid «پورسانت پرداختی» row from the chosen account', async () => {
  const b = await live(); await p.evaluate(() => { closeSheet(); commSheet('pm'); }); await p.waitForSelector('#sheetRoot form[data-form=comm]');
  await fill(p, { f_cma: '1.2' }); await pick({ f_acct: BANK }); await sub();
  const r = await added(b); assert(r.length === 1 && r[0].kind === 'paid' && r[0].personId === 'pm' && r[0].amount === 1.2e6 && r[0].category === 'پورسانت پرداختی' && r[0].acct === BANK && r[0].comm, 'comm: ' + JSON.stringify(r));
  await inv('after comm');
});

test('lotExtra: an extra purchase cost on a lot writes a paid row on that lot and raises its unit cost', async () => {
  const b = await live(), c0 = await p.evaluate(() => lotCost(byId('lots', 'L1')));
  await act('lotExtra', { id: 'L1' }); await p.waitForSelector('#sheetRoot form[data-form=lotExtra]');
  await fill(p, { f_xam: '4' }); await pick({ f_acct: BANK }); await sub();
  const r = await added(b), l = await p.evaluate(() => ({ extra: byId('lots', 'L1').extra || 0, pack: byId('lots', 'L1').extraPack || 0, cost: lotCost(byId('lots', 'L1')) }));
  assert(r.length === 1 && r[0].kind === 'paid' && r[0].amount === 4e6 && r[0].lotId === 'L1' && r[0].category === 'خرید و تأمین کالا' && (l.extra + l.pack) === 4e6 && l.cost > c0, 'lotExtra: ' + JSON.stringify({ r, l, c0 }));
  await inv('after lotExtra');
});

test('move (sale from a lot, cash) writes the sale move and one received row; moveEdit of its price updates that row with history', async () => {
  let b = await live(); await openForm('formMove', [{ lotId: 'L1', personId: 'pc' }], 'move');
  await pick({ f_mk: 'sale' }); await fill(p, { f_mqty: '3', f_mprice: '1.5' }); await pick({ f_mpay: 'cash', f_macct: BANK, f_person: 'pc' }); await sub();
  const r = await added(b), m = await p.evaluate(() => { const x = S.moves.find(m => !m.void && m.lotId === 'L1' && m.kind === 'sale'); return x && JSON.parse(JSON.stringify(x)); });
  assert(m && m.qty === 3 && r.length === 1 && r[0].kind === 'received' && r[0].amount === 4.5e6 && r[0].acct === BANK && r[0].personId === 'pc', 'sale: ' + JSON.stringify({ m, r }));
  await inv('after move');
  // 0.6 s after a sale the app asks «فاکتور لازم است؟»; answer «لازم نیست» before going on
  await p.waitForFunction(() => /فاکتور لازم است/.test(document.getElementById('sheetRoot').innerText), null, { timeout: 3000 }); await p.click('#sheetRoot [data-act=close]');
  await p.evaluate(id => { closeSheet(); formMoveEdit(byId('moves', id)); }, m.id); await p.waitForSelector('#sheetRoot form[data-form=moveEdit]');   // the app passes the stored move (it marks it «locked»)
  const editable = await p.evaluate(() => !!document.getElementById('f_mprice'));
  assert(editable, 'a sale with a price should show its price for editing (locked move)');
  if (editable) { await fill(p, { f_mprice: '1.6' }); await sub(); const g = await L(r[0].id);
    assert(g.amount === 4.8e6 && g.moveId === m.id && JSON.stringify((g.hist || []).map(h => [h.from, h.to])) === JSON.stringify([[4.5e6, 4.8e6]]), 'moveEdit: ' + JSON.stringify([g.amount, g.moveId, g.hist])); }
  else { await sub(); const g = await L(r[0].id); assert(g.amount === 4.5e6, 'moveEdit without price changed the row'); }
  await inv('after moveEdit');
});

test('repack: packing 12 jars with a packing cost writes a packing lot, a pack move and one paid row; voidMove of that packing voids all three', async () => {
  let b = await live(); await openForm('formRepack', ['L1'], 'repack');
  await pick({ f_rpk: 'pk1' }); await fill(p, { f_rct: '1', f_rlo: '0', f_rcost: '0.1' }); await pick({ f_acct: BANK }); await sub();
  const r = await added(b), k = await p.evaluate(() => { const c = S.lots.find(l => !l.void && l.source === 'pack' && l.parentId === 'L1'); const m = c && byId('moves', c.parentMove); return c && { cid: c.id, qty: c.qty, mid: m && m.id, mq: m && m.qty }; });
  assert(k && k.qty === 12 && k.mq === 12 && r.length === 1 && r[0].pack && r[0].kind === 'paid' && r[0].amount === 1.2e6 && r[0].lotId === k.cid, 'repack: ' + JSON.stringify({ k, r }));
  await inv('after repack');
  await p.evaluate(i => { closeSheet(); viewMove(i); }, k.mid); await p.waitForSelector('#voidBox', { state: 'attached' }); await settle(p);
  await act('voidMoveAsk', { id: k.mid }, true); await p.waitForSelector('#sheetRoot form[data-form=voidMove] #f_vr', { state: 'attached' });
  await fill(p, { f_vr: 'بسته‌بندی آزمون باطل' }); await sub();
  const v = await p.evaluate(([cid, mid, gid]) => ({ lot: !!byId('lots', cid).void, move: !!byId('moves', mid).void, row: !!byId('ledger', gid).void, why: byId('ledger', gid).voidReason }), [k.cid, k.mid, r[0].id]);
  assert(v.lot && v.move && v.row && v.why === 'بسته‌بندی آزمون باطل', 'voidMove: ' + JSON.stringify(v)); await inv('after voidMove');
});

test('prod: production from 2 kg of the lot plus a 0.5 cost row → a new lot, a «prodin» move and one paid row on the new lot', async () => {
  const b = await live(); await openForm('formProd', [{}], 'prod');
  await fill(p, { f_prp: 'شربت آزمون', f_prq: '4', f_pru: 'عدد' });
  for (const a of ['prAdd', 'prX']) await p.evaluate(a => { const b = document.querySelector(`#sheetRoot [data-act=${a}]`); if (!document.querySelector(a === 'prAdd' ? '#prIn .prr' : '#prEx .prr')) b.click(); }, a);
  await p.evaluate(BANK => { const inr = document.querySelector('#prIn .prr'); if (inr) { const s = inr.querySelector('.pr_l'); if (s.tagName === 'SELECT' && ![...s.options].some(o => o.value === 'L1')) s.add(new Option('L1', 'L1')); s.value = 'L1'; inr.querySelector('.pr_q').value = '2'; }
    const ex = document.querySelector('#prEx .prr'); ex.querySelector('.pr_xd').value = 'برچسب آزمون'; ex.querySelector('.pr_xa').value = '0.5';
    const a = document.getElementById('f_pracct'); if (a) { if (a.tagName === 'SELECT' && ![...a.options].some(o => o.value === BANK)) a.add(new Option(BANK, BANK)); a.value = BANK; } }, BANK);
  await sub();
  const r = await added(b), x = await p.evaluate(() => { const l = S.lots.find(l => !l.void && l.source === 'prod'); return l && { id: l.id, qty: l.qty, ins: S.moves.filter(m => !m.void && m.kind === 'prodin' && m.childLot === l.id).map(m => [m.lotId, m.qty]) }; });
  assert(x && x.qty === 4 && JSON.stringify(x.ins) === '[["L1",2]]' && r.length === 1 && r[0].kind === 'paid' && r[0].amount === 0.5e6 && r[0].lotId === x.id && r[0].docId, 'prod: ' + JSON.stringify({ x, r }));
  await inv('after prod');
});

test('recur: editing a recurring payment fills in the missing account and category of its earlier rows (nothing else)', async () => {
  await openForm('formRecur', [{}], 'recur');
  await fill(p, { f_rt: 'قسط آزمون', f_ram: '1' }); await pick({ f_rbank: BANK });
  await p.evaluate(() => { const c = document.getElementById('f_rcat'); if (c.tagName === 'SELECT' && ![...c.options].some(o => o.value === 'شخصی: سایر')) c.add(new Option('شخصی: سایر', 'شخصی: سایر')); c.value = 'شخصی: سایر'; c.dispatchEvent(new Event('change', { bubbles: true }));
    if (!document.querySelector('#sheetRoot [data-rd][aria-pressed=true]')) { const d = document.querySelector('#sheetRoot [data-rd]'); if (d) d.setAttribute('aria-pressed', 'true'); } });
  await sub(); const rid = await p.evaluate(() => (S.recurs.find(r => r.title === 'قسط آزمون') || {}).id); assert(rid, 'recurring payment not saved');
  await p.evaluate(async rid => { const n = nowTs(); await putRaw('ledger', { id: 'rr1', recurId: rid, kind: 'paid', amount: 1e6, currency: 'تومان', about: 'قسط آزمون', date: today(), instrument: 'نقد/کارت', settled: false, void: false, created: n, updated: n }); }, rid);
  await openForm('formRecur', [await p.evaluate(rid => byId('recurs', rid), rid)], 'recur'); await sub();
  const g = await L('rr1'), rc = await p.evaluate(rid => byId('recurs', rid), rid);
  assert(g.acct === rc.bank && g.category === rc.cat && g.amount === 1e6, 'recur fill-in: ' + JSON.stringify({ acct: g.acct, cat: g.category, want: [rc.bank, rc.cat] }));
  await inv('after recur');
});

test('voucher: converting a ledger row into a journal voucher saves the voucher and voids the row with a link to it', async () => {
  await p.evaluate(async BANK => { const n = nowTs(); await putRaw('ledger', { id: 'cv1', kind: 'paid', amount: 2e6, currency: 'تومان', acct: BANK, about: 'اجارهٔ آزمون', category: 'شخصی: سایر', date: today(), instrument: 'نقد/کارت', settled: false, void: false, created: n, updated: n }); }, BANK);
  await openForm('formVoucher', [{ desc: 'سند آزمون', lines: [{ acc: '5106', dr: 2e6 }, { acc: '1101', bank: BANK, cr: 2e6 }] }, null, { fromLed: 'cv1' }], 'voucher'); await sub();
  const r = await p.evaluate(() => { const v = S.vouchers.find(x => !x.void && x.desc === 'سند آزمون'); const l = byId('ledger', 'cv1'); return { v: v && v.id, void: l.void, vch: l.vchId, why: l.voidWhy }; });
  assert(r.v && r.void && r.vch === r.v && r.why === 'به سند حسابداری تبدیل شد', 'voucher: ' + JSON.stringify(r)); await inv('after voucher');
});

test('no page errors', async () => { assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
