// «طلب و بدهی»: the person page (net balance) and the money tab's row lists (aging, due lists) agree after the seven reported
// scenarios, because «تسویه‌شده» is recomputed when an amount, a person or a linked payment is edited (ledSync), with history.
// A row settled by hand without full payment (discount, forgiveness, agreement) is never reopened; it is listed in «عیب‌یابی داده‌ها».
// Prepayments and overpayments are shown read-only («پیش‌دریافت، اضافه‌پرداخت و اختلاف»). The books do not change because of a
// recomputed flag. Real forms; synthetic people only.
const { serve, launch, openApp, settle, fill, submitForm, invariants, test, run, assert } = require('./lib');
let srv, o, p;
// page = person page / «مانده هر طرف حساب» (net); agingRecv / agingPay = the money tab's aging lists; due = dueLedger rows;
// gap = the read-only prepayment/overpayment section
const views = pid => p.evaluate(pid => { const ag = k => S.ledger.concat(vchRem()).filter(l => !l.void && !l.settled && l.kind === k && l.personId === pid && (l.currency || 'تومان') === 'تومان').reduce((a, l) => { const r = remOf(l); return r > 0.5 ? a + r : a; }, 0);
  const g = arapGaps().find(x => x.pid === pid);
  return { page: (balances(pid)['تومان'] || 0) / 1e6, table: ((personBal()[pid] || {})['تومان'] || 0) / 1e6, agingRecv: ag('receivable') / 1e6, agingPay: ag('payable') / 1e6,
    due: dueLedger(3650).filter(l => l.personId === pid).map(l => remOf(l) / 1e6), gap: g ? g.gap / 1e6 : 0, susp: g ? g.susp : 0 }; }, pid);
const agree = v => Math.abs(v.page - (v.agingRecv - v.agingPay) - v.gap) < 1e-6 && v.page === v.table;
const mk = (id, name) => p.evaluate(async ([id, name]) => { const n = nowTs(); await putRaw('people', { id, name, created: n, updated: n }); }, [id, name]);
const row = (id, pid, kind, amount, extra = {}) => p.evaluate(async ([id, pid, kind, amount, extra]) => { const n = nowTs(); await putRaw('ledger', { id, kind, personId: pid, amount, currency: 'تومان', about: 'آزمون ' + id, category: 'درمان و مشاوره', date: '2026-10-01', due: '2026-10-20', instrument: 'نسیه', settled: false, void: false, created: n, updated: n, ...extra }); }, [id, pid, kind, amount, extra]);
const settleForm = async (id, amt) => { await p.evaluate(id => { closeSheet(); const b = document.createElement('button'); b.dataset.act = 'settle'; b.dataset.id = id; document.body.appendChild(b); b.click(); b.remove(); }, id);
  await p.waitForSelector('#sheetRoot form[data-form=settle]'); await fill(p, { f_samt: String(amt) });
  await p.evaluate(() => { const a = document.getElementById('f_acct'); if (a && a.tagName === 'SELECT' && !a.value) { if (!a.options.length) a.add(new Option('بانک الف', 'بانک الف')); a.value = a.options[a.options.length - 1].value; } });
  await submitForm(p); await settle(p); };
const openEdit = async id => { await p.evaluate(id => { closeSheet(); formLedgerEdit(byId('ledger', id)); }, id); await p.waitForSelector('#sheetRoot form[data-form=ledgerEdit]'); };
const editAmount = async (id, amt) => { await openEdit(id); await fill(p, { f_amt: String(amt) }); await submitForm(p); await settle(p); };
const payOf = rid => p.evaluate(rid => (S.ledger.find(x => !x.void && x.refId === rid) || {}).id, rid);
const hist = id => p.evaluate(id => (byId('ledger', id).hist || []).map(h => h.to || '').filter(t => t === 'open' || t === 'settled'), id);
const inv = async w => { const v = await invariants(p); assert(!v.length, w + ': ' + v.join('; ')); };

test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs(); await putRaw('meta', { id: 'accts', a: { 'بانک الف': { open: 100e6, openDate: '2026-09-23', setAt: n } }, created: n, updated: n }); }); });

test('1 receivable 10 paid in full, then the receivable corrected to 15 → reopened, 5 open everywhere, history kept', async () => {
  await mk('pA', 'شخص الف'); await row('rA', 'pA', 'receivable', 10e6); await settleForm('rA', 10); await editAmount('rA', 15);
  const v = await views('pA'); assert(v.page === 5 && v.agingRecv === 5 && JSON.stringify(v.due) === '[5]' && agree(v), JSON.stringify(v));
  assert(JSON.stringify(await hist('rA')) === '["open"]', 'history: ' + JSON.stringify(await hist('rA'))); await inv('1');
});
test('2 receivable 10 paid, then the payment corrected to 7 → reopened, 3 open', async () => {
  await mk('pB', 'شخص ب'); await row('rB', 'pB', 'receivable', 10e6); await settleForm('rB', 10); await editAmount(await payOf('rB'), 7);
  const v = await views('pB'); assert(v.page === 3 && v.agingRecv === 3 && agree(v), JSON.stringify(v)); await inv('2');
});
test('3 payable 8 paid, then the payment corrected to 5 → my debt 3 open', async () => {
  await mk('pC', 'شخص ج'); await row('rC', 'pC', 'payable', 8e6); await settleForm('rC', 8); await editAmount(await payOf('rC'), 5);
  const v = await views('pC'); assert(v.page === -3 && v.agingPay === 3 && agree(v), JSON.stringify(v)); await inv('3');
});
test('4 payable 8 paid, then the payable corrected to 12 → my debt 4 open', async () => {
  await mk('pE', 'شخص ه'); await row('rE', 'pE', 'payable', 8e6); await settleForm('rE', 8); await editAmount('rE', 12);
  const v = await views('pE'); assert(v.page === -4 && v.agingPay === 4 && agree(v), JSON.stringify(v)); await inv('4');
});
test('5 receivable 10 settled with 12 (overpaid) → 2 shown in the prepayment/overpayment section; integrity lists it', async () => {
  await mk('pD', 'شخص د'); await row('rD', 'pD', 'receivable', 10e6); await settleForm('rD', 12);
  const v = await views('pD'); assert(v.page === -2 && v.agingRecv === 0 && v.gap === -2 && agree(v), JSON.stringify(v));
  assert(await p.evaluate(() => integCheck().groups.some(g => g.k === 'setl' && g.items.some(x => x.id === 'rD' && /بیشتر/.test(x.note)))), 'integrity');
});
test('6 advance payment 5 with no open receivable → shown in the section', async () => {
  await mk('pI', 'شخص ط'); await row('aI', 'pI', 'received', 5e6, { settles: true, instrument: 'نقد/کارت', acct: 'بانک الف', due: '' });
  const v = await views('pI'); assert(v.page === -5 && v.gap === -5 && agree(v), JSON.stringify(v));
});
test('7 a settled receivable moved to another person → its payments follow it; both people agree (no orphan credit)', async () => {
  await mk('pF', 'شخص و'); await mk('pG', 'شخص ز'); await row('rF', 'pF', 'receivable', 10e6); await settleForm('rF', 10);
  await openEdit('rF'); await p.evaluate(() => { const s = document.getElementById('f_person'); s.value = 'pG'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await submitForm(p); await settle(p);
  const a = await views('pF'), b = await views('pG'), pay = await p.evaluate(() => byId('ledger', S.ledger.find(x => !x.void && x.refId === 'rF').id));
  assert(a.page === 0 && b.page === 0 && agree(a) && agree(b) && pay.personId === 'pG' && (pay.hist || []).length, JSON.stringify({ a, b, pay: pay.personId }));
  await inv('7');
});
test('a payment cannot be moved alone to a person other than the row it settles', async () => {
  await mk('pK', 'شخص ک'); await mk('pL', 'شخص ل'); await row('rK', 'pK', 'receivable', 4e6); await settleForm('rK', 4); const pid = await payOf('rK');
  await openEdit(pid); await p.evaluate(() => { const s = document.getElementById('f_person'); s.value = 'pL'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.evaluate(() => { const f = document.querySelector('#sheetRoot form[data-form=ledgerEdit]'); (f.querySelector('button[type=submit]') || [...f.querySelectorAll('button.pri:not([type=button])')].pop()).click(); }); await p.waitForTimeout(300); await settle(p);
  const r = await p.evaluate(pid => ({ who: byId('ledger', pid).personId, toast: document.getElementById('toast').textContent }), pid);
  assert(r.who === 'pK' && /خودِ آن ردیف/.test(r.toast), JSON.stringify(r)); await p.evaluate(() => closeSheet());
});

test('a row settled by hand without full payment (discount / forgiveness) is never reopened by an edit; integrity lists it', async () => {
  await mk('pM', 'شخص م'); await row('rM', 'pM', 'receivable', 10e6); await settleForm('rM', 6);
  await p.evaluate(async () => { const l = byId('ledger', 'rM'); await putRaw('ledger', { ...l, settled: true, settledAt: nowTs(), updated: nowTs() }); });   // settled by hand (older version)
  await editAmount('rM', 11); await openEdit('rM'); await fill(p, { f_about: 'تخفیف آزمون' }); await submitForm(p); await settle(p);
  const r = await p.evaluate(() => ({ settled: byId('ledger', 'rM').settled, flagHist: (byId('ledger', 'rM').hist || []).filter(h => h.to === 'open').length }));
  assert(r.settled === true && r.flagHist === 0, 'manual settlement reopened: ' + JSON.stringify(r));
  const v = await views('pM'); assert(v.susp === 1 && agree(v), JSON.stringify(v));
  assert(await p.evaluate(() => integCheck().groups.some(g => g.k === 'setl' && g.items.some(x => x.id === 'rM' && /کمتر/.test(x.note)))), 'integrity');
});

test('the edit, the moved payments and the recomputed flag are one operation: a failure changes nothing', async () => {
  await mk('pN', 'شخص ن'); await row('rN', 'pN', 'receivable', 10e6); await settleForm('rN', 10);
  const before = await p.evaluate(() => JSON.stringify(S.ledger.filter(x => x.personId === 'pN' || x.refId === 'rN')));
  await openEdit('rN'); await fill(p, { f_amt: '۱۵' });
  await p.evaluate(() => { window._st = Store.stage; let n = 0; Store.stage = function (B, col, doc) { if (col === 'ledger' && ++n === 2) throw new Error('synthetic failure'); return window._st.apply(this, arguments); }; });
  await p.evaluate(() => { const f = document.querySelector('#sheetRoot form[data-form=ledgerEdit]'); (f.querySelector('button[type=submit]') || [...f.querySelectorAll('button.pri:not([type=button])')].pop()).click(); });
  await p.waitForTimeout(400); await settle(p); await p.evaluate(() => { Store.stage = window._st; closeSheet(); });
  assert((await p.evaluate(() => JSON.stringify(S.ledger.filter(x => x.personId === 'pN' || x.refId === 'rN')))) === before, 'half an edit stayed');
});

test('the books do not change because of a recomputed flag; the money tab shows the section; no page errors', async () => {
  const gl = () => p.evaluate(() => JSON.stringify(balancesByAcc(autoEntries(), 'تومان')));
  await mk('pO', 'شخص س'); await row('rO', 'pO', 'receivable', 10e6); await settleForm('rO', 10);
  const g0 = await gl(); const n = await p.evaluate(async () => { const l = byId('ledger', 'rO'); await putRaw('ledger', { ...l, amount: 12e6, updated: nowTs() }); return 0; });
  const g1 = await gl(); await p.evaluate(async () => { await ledSync([{ id: 'rO', ok: true }], 'آزمون'); }); await settle(p);
  assert((await gl()) === g1 && g1 !== g0, 'books changed by the flag');
  const t = await p.evaluate(() => { closeSheet(); tab = 'money'; ui.ms = 'ppl'; render(); return document.getElementById('view').innerText; });
  assert(/پیش‌دریافت، اضافه‌پرداخت و اختلاف/.test(t) && /ناجور/.test(t), 'section missing');
  await inv('end'); assert(!o.errors.length, o.errors.join(' | '));
});
test('ARAP-3: an overpayment balanced by a voucher refund → person page, lists and the section agree (no gap); an unbalanced one still shows', async () => {
  await mk('pP', 'شخص پ'); await row('rP', 'pP', 'receivable', 10e6); await settleForm('rP', 12);
  let v = await views('pP'); assert(v.gap === -2, 'unbalanced overpayment must show: ' + JSON.stringify(v));
  await p.evaluate(async () => { const n = nowTs(); await putRaw('vouchers', { id: 'vP', date: '2026-10-03', desc: 'برگشت اضافه', lines: [{ acc: '1201', dr: 2e6, personId: 'pP' }, { acc: '1101', cr: 2e6, bank: 'بانک الف' }], created: n, updated: n }); });
  v = await views('pP'); assert(v.page === 0 && v.agingRecv === 0 && v.gap === 0 && agree(v), 'balanced: ' + JSON.stringify(v)); await inv('ARAP-3');
});
test('ARAP-2: a receivable reopened by an edit reopens the person\'s closed follow-up; a second reopen creates no second task', async () => {
  await mk('pQ', 'شخص ق'); await row('rQ', 'pQ', 'receivable', 10e6, { due: '2026-09-01' }); await settleForm('rQ', 10);
  await p.evaluate(async () => { const n = nowTs(); await putRaw('tasks', { id: recvTid('pQ'), title: 'پیگیری طلب آزمون', personId: 'pQ', status: 'done', doneAt: n, flow: { kind: 'recv', personId: 'pQ', closed: 'paid' }, created: n, updated: n }); });
  const t0 = await p.evaluate(() => S.tasks.length);
  await editAmount('rQ', 15);
  let r = await p.evaluate(() => { const t = byId('tasks', recvTid('pQ')); return { st: t.status, closed: t.flow.closed, log: (t.log || []).length }; });
  assert(r.st === 'open' && r.closed === '' && r.log === 1, 'follow-up not reopened: ' + JSON.stringify(r));
  await settleForm('rQ', 5); await p.evaluate(async () => { const t = byId('tasks', recvTid('pQ')); await save('tasks', t.id, { status: 'done', flow: { ...t.flow, closed: 'paid' } }); });
  await editAmount('rQ', 16);
  r = await p.evaluate(t0 => ({ n: S.tasks.length - t0, st: byId('tasks', recvTid('pQ')).status }), t0);
  assert(r.n === 0 && r.st === 'open', 'duplicate follow-up or not reopened: ' + JSON.stringify(r)); await inv('ARAP-2');
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
