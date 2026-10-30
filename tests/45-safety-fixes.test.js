// Review fixes: H1 the receivables follow-up is never updated from a half-written state (restore, a user action); H2 shared
// text reaches Gemini only after «بفهم»; M1 only money-context numbers can be amounts; M2 one privacy filter in front of
// every Gemini request removes the names of people with a clinical record. Synthetic data only; Gemini is never reached.
const { serve, launch, openApp, settle, test, run, assert } = require('./lib');
let srv, A, p;
const fakeGemini = p => p.evaluate(() => { localStorage.setItem('miz.ai', JSON.stringify({ key: 'SYNTHETIC-NOT-A-KEY', on: true })); window._bodies = [];
  window.fetch = async (u, o) => { if (String(u).includes('generativelanguage')) { window._bodies.push(String(o && o.body || '')); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"actions":[]}' }] } }] }), { status: 200 }); } throw new Error('blocked'); }; });

test('H1: restoring a backup with an overdue receivable and its open follow-up keeps the follow-up open; a paid one is closed once, after the restore', async () => {
  srv = await serve(); A = await launch(); await openApp(A, srv.url);
  const plain = await A.page.evaluate(async () => { const n = nowTs(), b = { created: n, updated: n, void: false };
    for (const [id, name] of [['px', 'مشتری بازیابی آزمون'], ['py', 'مشتری پرداخت‌کرده آزمون']]) await putRaw('people', { id, name, ...b });
    await putRaw('ledger', { id: 'rx', kind: 'receivable', personId: 'px', amount: 5e6, currency: 'تومان', due: addDays(today(), -3), date: addDays(today(), -10), settled: false, instrument: 'نسیه', category: 'فروش کالا', about: 'x', ...b });
    await putRaw('ledger', { id: 'ry', kind: 'receivable', personId: 'py', amount: 2e6, currency: 'تومان', due: addDays(today(), -3), date: addDays(today(), -10), settled: false, instrument: 'نسیه', category: 'فروش کالا', about: 'y', ...b });
    await recvFollow(); await new Promise(r => setTimeout(r, 200));
    // py pays in full: the receivable is settled but its follow-up is still open in the backup (as if closed later on another device)
    await putRaw('ledger', { id: 'yy', kind: 'received', personId: 'py', amount: 2e6, currency: 'تومان', acct: 'بانک الف', refId: 'ry', date: today(), settled: false, instrument: 'نقد/کارت', about: 'pay', ...b });
    await putRaw('ledger', { ...byId('ledger', 'ry'), settled: true, settledAt: n }); await putRaw('tasks', { ...byId('tasks', 'recv-py'), status: 'open', doneAt: '', log: [], flow: { kind: 'recv', personId: 'py', rem: 2e6 } });
    return JSON.stringify(backupData()); });
  for (const how of ['ui', 'call']) {
    const B = await launch(); await openApp(B, srv.url); const q = B.page;
    await q.evaluate(j => restoreJson(JSON.parse(j), 'آزمون'), plain); await q.waitForSelector('#sheetRoot [data-act=rsGo]');
    if (how === 'ui') await q.click('#sheetRoot [data-act=rsGo]'); else await q.evaluate(() => restoreApply(false));
    await settle(q); await q.waitForTimeout(300);
    const r = await q.evaluate(() => ({ x: byId('tasks', 'recv-px'), y: byId('tasks', 'recv-py') }));
    assert(r.x && r.x.status === 'open' && !(r.x.log || []).length, `${how}: open follow-up closed by the restore: ` + JSON.stringify(r.x));
    assert(r.y && r.y.status === 'done' && (r.y.log || []).length === 1 && r.y.flow.closed === 'paid', `${how}: paid follow-up not closed exactly once: ` + JSON.stringify(r.y));
    assert(!B.errors.length, B.errors.join(' | ')); await B.ctx.close();
  }
});

test('H1: inside one action, replacing a receivable (void, then a new one) does not close its follow-up on the way; it is updated once at the end', async () => {
  p = A.page;
  const r = await p.evaluate(async () => { const n = nowTs();
    await recvBatch(async () => { await save('ledger', 'rx', { void: true, voidReason: 'جایگزین شد', voidAt: n }); await new Promise(r => setTimeout(r, 120));
      await putRaw('ledger', { id: 'rx2', kind: 'receivable', personId: 'px', amount: 4e6, currency: 'تومان', due: addDays(today(), -3), date: addDays(today(), -10), settled: false, void: false, instrument: 'نسیه', category: 'فروش کالا', about: 'x2', created: n, updated: n }); });
    await new Promise(r => setTimeout(r, 300)); const t = byId('tasks', 'recv-px'); return { st: t.status, rem: t.flow.rem, log: (t.log || []).map(x => x.text) }; });
  assert(r.st === 'open' && r.rem === 4e6 && !r.log.some(x => x.includes('بسته')), 'follow-up: ' + JSON.stringify(r));
});

test('H2: shared text only fills the assistant box — zero Gemini requests until «بفهم», then exactly one', async () => {
  await fakeGemini(p);
  await p.evaluate(async () => { const c = await caches.open('miz-share'); await c.put('share-text', new Response('پیام خصوصی آزمون: فردا ساعت ۵ با مشتری بازیابی آزمون تماس بگیرم')); history.replaceState(null, '', location.pathname + '?share=1'); closeSheet(); await checkShared(); });
  await p.waitForTimeout(400);
  let r = await p.evaluate(() => ({ n: window._bodies.length, box: (document.getElementById('f_ais') || {}).value || '' }));
  assert(r.n === 0 && r.box.includes('پیام خصوصی آزمون'), 'before «بفهم»: ' + JSON.stringify(r));
  await p.evaluate(() => document.querySelector('#sheetRoot form[data-form=aisay] button.pri').click()); await p.waitForTimeout(300);
  r = await p.evaluate(() => window._bodies.length); assert(r === 1, 'after «بفهم»: ' + r + ' requests');
});

test('M1: dates, years, times, phone numbers and quantities are not money; currency/unit or money words are', async () => {
  const r = await p.evaluate(() => [asNums('۱۰ مهر ساعت ۵ با ۰۹۱۲۳۴۵۶۷۸۹ تماس، فاکتور سال ۱۴۰۵ و تاریخ ۱۴۰۵/۰۷/۰۱ و ۳ کیلو عسل'),
    asNums('۲ میلیون و ۵۰۰ هزار تومان و ۲۵۰,۰۰۰ تومان و ۳۰,۰۰۰,۰۰۰ ریال'), asNums('هر کیلو ۱٫۲ و مبلغ ۷')]);
  assert(!r[0].money.length && r[0].qty.includes(3), 'non-money: ' + JSON.stringify(r[0]));
  assert(JSON.stringify(r[1].money) === JSON.stringify([2, 0.5, 0.25, 3]), 'money: ' + JSON.stringify(r[1]));
  assert(JSON.stringify(r[2].money) === JSON.stringify([1.2, 7]), 'money words: ' + JSON.stringify(r[2]));
  const n = await p.evaluate(() => { const t = 'فاکتور سال ۱۴۰۵ ساعت ۵ برای ۳ کیلو عسل به مشتری بازیابی آزمون، کلاً ۳٫۶ میلیون';
    return [asNorm({ intent: 'received', amount: 1405 }, t).amount, asNorm({ intent: 'received', amount: 5 }, t).amount, asNorm({ intent: 'received', amount: 3 }, t).amount, asNorm({ intent: 'received', amount: 3.6 }, t).amount,
      asNorm({ intent: 'sale', items: [{ desc: 'عسل', qty: 3, unit: 'کیلو', price: 1.2 }] }, t).items[0], asNorm({ intent: 'paid', amount: 0 }, 'به مشتری بازیابی آزمون پول دادم').issues]; });
  assert(n[0] === 0 && n[1] === 0 && n[2] === 0 && n[3] === 3.6, 'amounts: ' + JSON.stringify(n.slice(0, 4)));
  assert(n[4].qty === 3 && n[4].price === 1.2, 'price × quantity: ' + JSON.stringify(n[4]));
  assert(n[5].some(x => x.includes('مبلغ')), 'a missing amount must be asked for, not filled: ' + JSON.stringify(n[5]));
});

test('M2: every Gemini request (assistant and questions) leaves out the names of people with a clinical record, even without clinical words', async () => {
  await p.evaluate(async () => { const n = nowTs(), b = { created: n, updated: n, void: false };
    await putRaw('people', { id: 'pm', name: 'مریم صدرنشین', ...b }); await putRaw('people', { id: 'pb', name: 'بهرام فروشنده', ...b });
    await putRaw('cases', { id: 'cm', personId: 'pm', code: 'SYN-1', status: 'open', ...b }); });
  await fakeGemini(p);
  await p.evaluate(async () => { closeSheet(); asSheet('فردا با مریم صدرنشین و بهرام فروشنده تماس بگیرم'); document.querySelector('#sheetRoot form[data-form=aisay] button.pri').click(); await new Promise(r => setTimeout(r, 300));
    await aiAsk('مریم صدرنشین چقدر بدهکار است؟'); await new Promise(r => setTimeout(r, 300)); });
  const r = await p.evaluate(() => window._bodies.map(b => JSON.parse(b).contents[0].parts[0].text));
  assert(r.length === 2 && r.every(t => !t.includes('مریم') && !t.includes('صدرنشین')) && r[0].includes('بهرام فروشنده'), 'sent: ' + JSON.stringify(r));
  const own = await p.evaluate(() => aiShield('صدرنشین، مریم و مریم صدرنشین')); assert(!/مریم|صدرنشین/.test(own), 'filter: ' + own);
});

test('H1 residual: the start-up job (recurring payments) writes several rows as one batch — the follow-up is updated only after all of them', async () => {
  const r = await p.evaluate(async () => { const n = nowTs();
    await putRaw('recurs', { id: 'rq', title: 'اجارهٔ روزانهٔ آزمون', amount: 1e6, per: 'daily', from: addDays(today(), -3), active: true, auto: true, bank: 'بانک الف', cat: 'اجاره', dir: 'out', created: n, updated: n });
    const real = window.recvSync, seen = []; let done = false; const n0 = S.ledger.length;
    window.recvSync = async () => { seen.push({ done, rows: S.ledger.length }); return real(); };
    await bootRun(); done = true; await new Promise(r => setTimeout(r, 300)); window.recvSync = real;
    return { seen, added: S.ledger.length - n0 }; });
  assert(r.added >= 3, 'fixture: recurring rows not generated: ' + r.added);
  assert(r.seen.length >= 1 && r.seen.every(x => x.done), 'follow-up updated in the middle of the start-up job: ' + JSON.stringify(r.seen));
});

test('M3: an assistant proposal stays pending when its form is closed without saving; it is done only after the save', async () => {
  await p.evaluate(() => { localStorage.removeItem('miz.ai'); window.fetch = undefined; });
  await p.evaluate(() => { closeSheet(); asSheet('فردا خرید کارتن آزمون؛ فردا تماس با بانک آزمون'); document.querySelector('#sheetRoot form[data-form=aisay] button.pri').click(); });
  await p.waitForTimeout(200);
  const go = i => p.evaluate(i => { const b = document.createElement('button'); b.dataset.act = 'asGo'; b.dataset.v = String(i); document.getElementById('sheetRoot').appendChild(b); b.click(); b.remove(); }, i);
  await go(0); await p.waitForSelector('#sheetRoot form[data-form=task]'); await p.waitForTimeout(50);
  await p.evaluate(() => closeSheet()); await p.waitForTimeout(100);
  let r = await p.evaluate(() => AS.acts.map(a => a.done)); assert(JSON.stringify(r) === '[false,false]', 'abandoned form marked done: ' + JSON.stringify(r));
  await p.evaluate(() => { asSheet(); }); await go(0); await p.waitForSelector('#sheetRoot form[data-form=task]'); await p.waitForTimeout(50);
  const n0 = await p.evaluate(() => S.tasks.length);
  await p.evaluate(() => document.querySelector('#sheetRoot form[data-form=task] button.pri').click()); await settle(p); await p.waitForTimeout(100);
  r = await p.evaluate(n0 => ({ done: AS.acts.map(a => a.done), added: S.tasks.length - n0 }), n0);
  assert(JSON.stringify(r.done) === '[true,false]' && r.added === 1, 'after saving: ' + JSON.stringify(r));
});

test('M4: confirming a recurring payment from a bank message stores its reference and receipt; sharing the same message again warns it was already processed (with and without a reference)', async () => {
  for (const [txt, ref] of [['برداشت ۲۰,۰۰۰,۰۰۰ ریال از حساب شما شماره پیگیری 445566', '445566'], ['برداشت ۲۰,۰۰۰,۰۰۰ ریال از حساب شما بابت قسط', '']]) {
    const id = await p.evaluate(async () => { const n = nowTs(), id = 'pq' + Math.random().toString(36).slice(2, 6); await putRaw('ledger', { id, kind: 'paid', amount: 2e6, currency: 'تومان', acct: 'بانک الف', category: 'اجاره', about: 'قسط دوره‌ای آزمون', date: today(), pending: true, settled: false, void: false, instrument: 'حواله', created: n, updated: n }); return id; });
    await p.evaluate(t => { closeSheet(); receiptSheet(t, null); }, txt);
    const ids = await p.evaluate(() => [...document.querySelectorAll('#sheetRoot [data-act=rcptPend]')].map(b => b.dataset.id)); assert(ids.includes(id), 'not offered: ' + JSON.stringify(ids));
    const n0 = await p.evaluate(() => S.ledger.length);
    await p.evaluate(id => { const b = document.createElement('button'); b.dataset.act = 'rcptPend'; b.dataset.id = id; document.getElementById('sheetRoot').appendChild(b); b.click(); b.remove(); }, id); await settle(p);
    const row = await p.evaluate(id => JSON.parse(JSON.stringify(byId('ledger', id))), id);
    assert(!row.pending && row.rcpt && row.evidence.includes('رسید بانک') && (!ref || (row.ref === ref && row.evidence.includes(ref))) && (await p.evaluate(() => S.ledger.length)) === n0, 'confirmed row: ' + JSON.stringify(row));
    await p.evaluate(t => { closeSheet(); receiptSheet(t, null); }, txt);
    const again = await p.evaluate(() => ({ t: document.getElementById('sheetRoot').innerText, offer: document.querySelectorAll('#sheetRoot [data-act=rcptPend]').length }));
    assert(again.t.includes('قبلاً ثبت شده') && !again.offer, `second share (${ref ? 'with' : 'without'} reference): ` + again.t.slice(0, 200));
  }
  await p.evaluate(() => closeSheet());
});

test('no page errors, nothing sent', async () => { assert(!A.errors.length, A.errors.join(' | ')); assert(!A.net.external.length, A.net.external.join(' | ')); await A.ctx.close(); await srv.close(); });
run(__filename);
