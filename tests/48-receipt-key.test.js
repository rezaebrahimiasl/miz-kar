// A bank message is recognised as already processed when shared again: without its own date (any later day), after
// «ثبت دریافت/پرداخت» from the receipt page, and after «تسویه» from it; keys stored by 4.30 still match. Synthetic data only.
const { serve, launch, openApp, settle, fill, submitForm, invariants, test, run, assert } = require('./lib');
let srv, o, p;
const DAY1 = '2026-10-30T08:00:00.000Z', DAY2 = '2026-11-12T08:00:00.000Z';
const show = t => p.evaluate(t => { closeSheet(); receiptSheet(t, null); return document.getElementById('sheetRoot').innerText; }, t);
const done = t => /قبلاً ثبت شده/.test(t);
const act = (a, data) => p.evaluate(([a, data]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, data); document.getElementById('sheetRoot').appendChild(b); b.click(); b.remove(); }, [a, data]);
const pick = vals => p.evaluate(vals => { for (const [id, v] of Object.entries(vals)) { const e = document.getElementById(id); if (!e) continue; if (e.tagName === 'SELECT' && ![...e.options].some(o => o.value === v)) e.add(new Option(v, v)); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); } }, vals);

test('setup: a bank account, a pending recurring payment and an open receivable (synthetic)', async () => {
  srv = await serve(); o = await launch(); p = o.page; await p.clock.setFixedTime(new Date(DAY1)); await openApp(o, srv.url);
  await p.evaluate(async () => { const n = nowTs(), b = { created: n, updated: n, void: false, settled: false };
    await putRaw('people', { id: 'kc', name: 'مشتری رسید آزمون', ...b });
    await putRaw('meta', { id: 'accts', a: { 'بانک الف': { open: 100e6, openDate: '2026-01-01' } }, ...b });
    await putRaw('ledger', { id: 'rp', kind: 'paid', amount: 2e6, currency: 'تومان', acct: 'بانک الف', category: 'اجاره', about: 'قسط آزمون', date: today(), pending: true, instrument: 'حواله', ...b });
    await putRaw('ledger', { id: 'rv', kind: 'receivable', personId: 'kc', amount: 7e6, currency: 'تومان', category: 'فروش کالا', about: 'فاکتور آزمون', date: addDays(today(), -20), instrument: 'نسیه', ...b }); render(); });
});

test('a message without its own date, confirmed today, is still recognised two weeks later', async () => {
  const T = 'برداشت ۲۰,۰۰۰,۰۰۰ ریال از حساب شما بابت قسط آزمون';
  await show(T); await act('rcptPend', { id: 'rp' }); await settle(p);
  await p.clock.setFixedTime(new Date(DAY2));
  assert(done(await show(T)), 'not recognised on a later day');
  await p.clock.setFixedTime(new Date(DAY1));
});

test('a key stored by 4.30 (with the day it was confirmed) still matches; a dated message of another date does not', async () => {
  await p.evaluate(async () => { const n = nowTs(); await putRaw('ledger', { id: 'old', kind: 'paid', amount: 3e6, currency: 'تومان', acct: 'بانک الف', category: 'اجاره', about: 'ثبت ۴٫۳۰', date: '2026-09-01', settled: false, void: false, instrument: 'حواله', created: n, updated: n,
    rcpt: ['t', 'out', 3e6, '2026-09-01', nrm('برداشت ۳۰,۰۰۰,۰۰۰ ریال از حساب شما بابت آزمون قدیمی').replace(/\s+/g, '').slice(0, 80)].join('|') }); });
  assert(done(await show('برداشت ۳۰,۰۰۰,۰۰۰ ریال از حساب شما بابت آزمون قدیمی')), '4.30 key not recognised');
  await p.evaluate(async () => { const n = nowTs(), r = parseBank('۱ مهر ۱۴۰۵ برداشت ۴۰,۰۰۰,۰۰۰ ریال کارت'); await putRaw('ledger', { id: 'dt', kind: 'paid', amount: 4e6, currency: 'تومان', acct: 'بانک الف', category: 'اجاره', about: 'تاریخ‌دار', date: r.date, settled: false, void: false, instrument: 'حواله', created: n, updated: n, rcpt: rcptKey(r) }); });
  assert(!done(await show('۱ آبان ۱۴۰۵ برداشت ۴۰,۰۰۰,۰۰۰ ریال کارت')), 'a message of another date was taken for the same one');
  assert(done(await show('۱ مهر ۱۴۰۵ برداشت ۴۰,۰۰۰,۰۰۰ ریال کارت')), 'the same dated message not recognised');
});

test('«ثبت پرداخت» from the receipt page stores the key; the same message shared again is recognised; exactly one row', async () => {
  const T = 'برداشت ۱۵,۰۰۰,۰۰۰ ریال از حساب شما خرید آزمون'; await show(T);
  const n0 = await p.evaluate(() => S.ledger.length);
  await act('rcptUse', { v: 'paid' }); await p.waitForSelector('#sheetRoot form[data-form=ledger] #f_rcpt', { state: 'attached' });
  await pick({ f_acct: 'بانک الف', f_cat: 'شخصی: سایر' }); await submitForm(p); await settle(p);
  const add = await p.evaluate(n0 => S.ledger.slice(n0).map(l => [l.kind, l.amount, !!l.rcpt]), n0);
  assert(JSON.stringify(add) === JSON.stringify([['paid', 1.5e6, true]]), 'rows: ' + JSON.stringify(add));
  assert(done(await show(T)), 'registered message not recognised');
});

test('«تسویه» from the receipt page stores the key on the payment; the same message is then recognised and the receivable no longer offered', async () => {
  const T = 'واریز ۷۰,۰۰۰,۰۰۰ ریال به حساب شما از مشتری'; await show(T);
  assert(await p.evaluate(() => !!document.querySelector('#sheetRoot [data-act=rcptSettle][data-id=rv]')), 'receivable not offered');
  const n0 = await p.evaluate(() => S.ledger.length);
  await act('rcptSettle', { id: 'rv' }); await p.waitForSelector('#sheetRoot form[data-form=settle] #f_rcpt', { state: 'attached' });
  await fill(p, { f_acct: 'بانک الف' }); await submitForm(p); await settle(p);
  const add = await p.evaluate(n0 => S.ledger.slice(n0).map(l => [l.kind, l.amount, l.refId, !!l.rcpt]), n0);
  assert(JSON.stringify(add) === JSON.stringify([['received', 7e6, 'rv', true]]) && await p.evaluate(() => byId('ledger', 'rv').settled), 'settle: ' + JSON.stringify(add));
  const t = await show(T); assert(done(t) && !(await p.evaluate(() => !!document.querySelector('#sheetRoot [data-act=rcptSettle]'))), 'after settling: ' + t.slice(0, 200));
  const v = await invariants(p); assert(!v.length, v.join('; '));
});

test('no page errors', async () => { assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
