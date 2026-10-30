// Receivables follow-up (one task per person, closed or moved on by payments, reminder text prepared but never sent) and
// the person page (documents, letters, notes, transactions, contact history). Synthetic data only.
const { serve, launch, openApp, settle, invariants, fill, submitForm, test, run, assert } = require('./lib');
let srv, o, p;
const inv = async what => { const v = await invariants(p); assert(!v.length, `${what}: invariants broken: ${v.join('; ')}`); };
const act = (a, data = {}) => p.evaluate(([a, data]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, data); b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); }, [a, data]);
const task = () => p.evaluate(() => { const t = byId('tasks', 'recv-pa'); return t ? JSON.parse(JSON.stringify(t)) : null; });
const recvTasks = () => p.evaluate(() => S.tasks.filter(t => t.flow && t.flow.kind === 'recv').map(t => t.id + ':' + t.status));
const ledgerN = () => p.evaluate(() => S.ledger.length + S.vouchers.length);

test('setup: synthetic customers, receivables (overdue, soon, later, no due, net creditor) and a bank account', async () => {
  srv = await serve(); o = await launch(); p = o.page; await openApp(o, srv.url);
  await p.evaluate(async () => { const n = nowTs(), b = { created: n, updated: n }, d = k => addDays(today(), k);
    const L = (id, extra) => putRaw('ledger', { id, currency: 'تومان', settled: false, void: false, instrument: 'نسیه', category: 'فروش کالا', date: d(-40), ...b, ...extra });
    for (const [id, name, phone] of [['pa', 'مشتری الف آزمون', '۰۹۱۲۰۰۰۰۰۰۰'], ['pb', 'مشتری ب آزمون', ''], ['pc', 'مشتری ج آزمون', ''], ['pd', 'مشتری د آزمون', '']]) await putRaw('people', { id, name, phone, ...b });
    await putRaw('meta', { id: 'accts', a: { 'بانک الف': { open: 100e6, openDate: d(-60) } }, ...b });
    await L('r1', { kind: 'receivable', personId: 'pa', amount: 10e6, due: d(-5), about: 'فروش آزمون ۱' });
    await L('r2', { kind: 'receivable', personId: 'pa', amount: 4e6, due: d(3), about: 'فروش آزمون ۲' });
    await L('r3', { kind: 'receivable', personId: 'pb', amount: 6e6, due: d(30), about: 'سررسید دور' });
    await L('r4', { kind: 'receivable', personId: 'pc', amount: 5e6, due: d(-2), about: 'طلب از کسی که بیشتر طلبکار است' });
    await L('y4', { kind: 'payable', personId: 'pc', amount: 8e6, category: 'اجاره', about: 'بدهی به ج' });
    await L('r5', { kind: 'receivable', personId: 'pd', amount: 3e6, about: 'بدون سررسید' }); render(); });
  await inv('fixtures');
});

test('which receivables need a follow-up: overdue or due within 7 days, by what is still open; not later ones, not undated, not net creditors', async () => {
  const D = await p.evaluate(() => recvDue().map(o => ({ pid: o.pid, rem: o.rem, over: o.over, n: o.items.length, first: o.first === addDays(today(), -5) })));
  assert(JSON.stringify(D) === JSON.stringify([{ pid: 'pa', rem: 14e6, over: 10e6, n: 2, first: true }]), JSON.stringify(D));
  await p.evaluate(() => { closeSheet(); goTab('today'); }); await p.waitForTimeout(300);
  const a = await p.evaluate(() => { const x = document.getElementById('attnBox'); return x ? { t: x.textContent.includes('طلب سررسیده یا نزدیک'), b: !!x.querySelector('[data-act=recvFollow]') } : null; });
  assert(a && a.t && a.b, 'Today shows no receivables item: ' + JSON.stringify(a));
});

test('«ساخت کار پیگیری»: one task per person (due today for overdue); pressing again or from another page makes no duplicate; no money rows', async () => {
  const n0 = await ledgerN();
  await act('recvFollow'); await settle(p);
  const t = await task();
  assert(t && t.status === 'open' && t.personId === 'pa' && t.due === await p.evaluate(() => today()) && t.flow.rem === 14e6 && t.area === 'finance', 'task: ' + JSON.stringify(t));
  await act('recvFollow'); await act('recvFollow', { id: 'pa', v: 'person' }); await settle(p);
  assert(JSON.stringify(await recvTasks()) === '["recv-pa:open"]', 'duplicates: ' + JSON.stringify(await recvTasks()));
  assert((await ledgerN()) === n0, 'follow-up wrote money rows');
  assert(!(await p.evaluate(() => recvPlan().length)), 'still offered after the task exists');
  await p.evaluate(() => closeSheet());
});

test('reminder message: prepared with name, open amount and due date; nothing is sent; preparing it logs the reminder and moves the follow-up on', async () => {
  await act('recvMsg', { id: 'pa' }); await p.waitForSelector('#sheetRoot #f_rvmsg');
  const m = await p.evaluate(() => ({ txt: document.getElementById('f_rvmsg').value, num: document.getElementById('f_rvnum').value, want: moneyFull(14e6, 'تومان') }));
  assert(m.txt.includes('مشتری') && m.txt.includes(m.want) && m.txt.includes('گذشته') && m.num === '09120000000', 'message: ' + JSON.stringify(m));
  await p.evaluate(() => { navigator.share = undefined; navigator.clipboard.writeText = () => Promise.resolve(); });
  await act('recvSend', { id: 'pa', v: 'share' }); await settle(p);
  const t = await task(), last = (t.log || []).slice(-1)[0] || {};
  assert(last.text && last.text.includes('یادآوری طلب') && t.due === await p.evaluate(() => addDays(today(), 3)) && t.status === 'open', 'after reminder: ' + JSON.stringify(t));
  assert(!o.net.external.length, 'something left the phone: ' + o.net.external.join(' | '));
  await act('recvFollow', { id: 'pa' }); await settle(p);
  const t2 = await task(); assert(t2.due === t.due && (t2.log || []).length === (t.log || []).length, 'pressing «کار پیگیری» again changed the existing follow-up: ' + JSON.stringify([t.due, t2.due]));
});

test('partial payment through «تسویه» → one received row, follow-up stays open with the new remainder and a log line', async () => {
  const b = await p.evaluate(() => S.ledger.map(l => l.id));
  await act('settle', { id: 'r1' }); await p.waitForSelector('#sheetRoot form[data-form=settle]');
  await fill(p, { f_samt: '4', f_acct: 'بانک الف' }); await submitForm(p); await settle(p);
  const add = await p.evaluate(b => S.ledger.filter(l => !b.includes(l.id)).map(l => [l.kind, l.amount, l.refId]), b);
  const t = await task(), last = (t.log || []).slice(-1)[0] || {};
  assert(JSON.stringify(add) === JSON.stringify([['received', 4e6, 'r1']]), 'rows: ' + JSON.stringify(add));
  assert(t.status === 'open' && t.flow.rem === 10e6 && /بخشی/.test(last.text || '') && t.due === await p.evaluate(() => addDays(today(), 3)), 'task: ' + JSON.stringify(t));
  await inv('after partial payment');
});

test('a payment voucher not linked to a receivable also counts (oldest first); full settlement closes the follow-up, without the payment prompt', async () => {
  await p.evaluate(() => { closeSheet(); payVoucher({ inn: true, personId: 'pa', amount: 6e6, desc: 'دریافت آزمون' }); }); await p.waitForSelector('#sheetRoot form[data-form]');
  await submitForm(p); await settle(p);
  let t = await task(); assert(t.status === 'open' && t.flow.rem === 4e6, 'after voucher: ' + JSON.stringify(t.flow));
  await p.evaluate(() => closeSheet());
  await act('settle', { id: 'r2' }); await p.waitForSelector('#sheetRoot form[data-form=settle]');
  await fill(p, { f_samt: '4', f_acct: 'بانک الف' }); await submitForm(p); await settle(p); await p.waitForTimeout(900);
  t = await task(); const last = (t.log || []).slice(-1)[0] || {};
  assert(t.status === 'done' && t.flow.closed === 'paid' && t.flow.rem === 0 && /بسته شد/.test(last.text || ''), 'not closed: ' + JSON.stringify(t));
  const prompt = await p.evaluate(() => !!document.querySelector('#sheetRoot form[data-form=voucher]'));
  assert(!prompt, 'closing the follow-up opened a payment voucher');
  assert(!(await p.evaluate(() => recvDue().length)), 'still listed: ' + JSON.stringify(await p.evaluate(() => recvDue())));
  await inv('after full settlement');
});

test('a new overdue receivable for the same person: offered again, and the same follow-up is reopened, never a second one', async () => {
  await p.evaluate(async () => { const n = nowTs(); await putRaw('ledger', { id: 'r6', kind: 'receivable', personId: 'pa', amount: 2e6, currency: 'تومان', due: addDays(today(), -1), date: addDays(today(), -10), settled: false, void: false, instrument: 'نسیه', category: 'فروش کالا', about: 'فروش آزمون ۶', created: n, updated: n }); closeSheet(); });
  assert((await p.evaluate(() => recvPlan().map(o => o.pid).join())) === 'pa', 'not offered again');
  await act('recvFollow'); await settle(p);
  const t = await task();
  assert(JSON.stringify(await recvTasks()) === '["recv-pa:open"]' && t.flow.rem === 2e6 && (t.log || []).length >= 3, 'reopened task lost its history or duplicated: ' + JSON.stringify(t));
  await inv('after a new receivable');
});

test('person page: documents and letters, notes that name the person, transactions and contact history — only theirs, void ones left out', async () => {
  await p.evaluate(async () => { const n = nowTs(), b = { created: n, updated: n, void: false };
    await putRaw('docs', { id: 'da1', type: 'proforma', no: 'PF-71', personId: 'pa', date: today(), items: [{ desc: 'عسل آزمون', qty: 1, unit: 'کیلو', price: 1e6 }], fuAt: today(), ...b });
    await putRaw('docs', { id: 'da2', type: 'letter', toName: 'مشتری الف آزمون', subject: 'نامهٔ آزمون الف', date: today(), body: 'متن', ...b });
    await putRaw('docs', { id: 'da3', type: 'letter', toName: 'مشتری ب آزمون', subject: 'نامهٔ دیگری', date: today(), body: 'متن', ...b });
    await putRaw('docs', { id: 'da4', type: 'proforma', no: 'PF-72', personId: 'pa', date: today(), items: [], ...b, void: true });
    await putRaw('notes', { id: 'na1', title: 'قرار با مشتری الف آزمون', body: 'جزئیات', ...b });
    await putRaw('notes', { id: 'na2', title: 'یادداشت بی‌ربط', body: 'مشتری ب آزمون', ...b });
    await putRaw('quotes', { id: 'qa1', dir: 'gave', personId: 'pa', product: 'عسل آزمون', price: 1e6, currency: 'تومان', unit: 'کیلو', date: today(), sentAt: n, sentVia: 'واتساپ', ...b });
    closeSheet(); viewPerson('pa'); });
  const r = await p.evaluate(() => { const v = document.querySelector('#sheetRoot'); const sec = t => { const h = [...v.querySelectorAll('.blk-h h2')].find(x => x.textContent.trim() === t); return h ? h.closest('.blk-h').nextElementSibling : null; };
    const docs = sec('فاکتورها، نامه‌ها و اسناد'), notes = sec('یادداشت‌هایی که نام او را دارند'), hist = sec('سابقهٔ ارتباط و پیگیری'), recv = sec('طلب سررسیده یا نزدیک');
    return { docs: docs ? [...docs.querySelectorAll('[data-act=docView]')].map(x => x.dataset.id).sort() : null, notes: notes ? [...notes.querySelectorAll('[data-act=viewNote]')].map(x => x.dataset.id) : null,
      hist: hist ? hist.innerText : '', recv: recv ? recv.innerText : '', stmt: /حساب معین/.test(v.innerText) }; });
  assert(JSON.stringify(r.docs) === '["da1","da2"]', 'documents: ' + JSON.stringify(r.docs));
  assert(JSON.stringify(r.notes) === '["na1"]', 'notes: ' + JSON.stringify(r.notes));
  assert(/ارسال قیمت/.test(r.hist) && /یادآوری طلب/.test(r.hist) && /پیگیری پیش‌فاکتور/.test(r.hist), 'history misses entries: ' + r.hist);
  assert(r.recv.includes('مشتری الف آزمون') && r.stmt, 'receivable block or statement missing: ' + JSON.stringify(r));
  const other = await p.evaluate(() => { closeSheet(); viewPerson('pb'); const t = document.getElementById('sheetRoot').innerText; return { da3: !!document.querySelector('#sheetRoot [data-act=docView][data-id=da3]'), da1: !!document.querySelector('#sheetRoot [data-act=docView][data-id=da1]'), recv: t.includes('طلب سررسیده یا نزدیک') }; });
  assert(other.da3 && !other.da1 && !other.recv, 'other person: ' + JSON.stringify(other));
  await p.evaluate(() => closeSheet()); await inv('after person page');
});

test('no page errors, nothing sent', async () => { assert(!o.errors.length, o.errors.join(' | ')); assert(!o.net.external.length, o.net.external.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
