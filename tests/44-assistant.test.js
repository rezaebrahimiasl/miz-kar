// Stages 3–4: one input for everything (sentence, voice, shared text, bank message, bill, question), bank messages matched
// to recurring payments / open invoices / possible duplicates, and the assistant: several actions from one request, numbers
// checked against the user's own words, ambiguous people resolved by the user, nothing written without confirmation.
// Synthetic data only; Gemini is never reached (aiCall is replaced where the AI path is tested).
const { serve, launch, openApp, settle, invariants, fill, submitForm, test, run, assert } = require('./lib');
let srv, o, p;
const inv = async what => { const v = await invariants(p); assert(!v.length, `${what}: invariants broken: ${v.join('; ')}`); };
const snap = () => p.evaluate(() => [window._dv, JSON.stringify(COLS.map(c => S[c]))]);
const act = (a, data = {}) => p.evaluate(([a, data]) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.act = a; Object.assign(b.dataset, data); const r = document.getElementById('sheetRoot'); (r.hidden ? document.body : r).appendChild(b); b.click(); b.remove(); }, [a, data]);
const ask = async (text, ai) => { await p.evaluate(([text, ai]) => { if (!window._aiReal) window._aiReal = aiCall; if (ai) { localStorage.setItem('miz.ai', JSON.stringify({ key: 'SYNTHETIC-NOT-A-KEY', on: true })); window._aiSent = []; window.aiCall = async (sys, t) => { window._aiSent.push(t); return ai; }; } else { localStorage.removeItem('miz.ai'); window.aiCall = window._aiReal; } closeSheet(); asSheet(); }, [text, ai || null]);
  await fill(p, { f_ais: text }); await p.evaluate(() => document.querySelector('#sheetRoot form[data-form=aisay] button.pri').click()); await p.waitForTimeout(250); };   // asking never writes, so no wait for a save

test('setup: synthetic people (two with similar names), a bank account, a pending recurring payment, open receivables', async () => {
  srv = await serve(); o = await launch(); p = o.page; await openApp(o, srv.url);
  await p.evaluate(async () => { const n = nowTs(), b = { created: n, updated: n, void: false };
    for (const [id, name] of [['a1', 'علی رضایی آزمون'], ['a2', 'علی رضایی‌نیا آزمون'], ['bn', 'بهرام نمونه آزمون'], ['kc', 'کریم مشتری آزمون'], ['kd', 'داوود مشتری آزمون']]) await putRaw('people', { id, name, ...b });
    await putRaw('meta', { id: 'accts', a: { 'بانک الف': { open: 100e6, openDate: '2026-01-01' } }, ...b });
    await putRaw('ledger', { id: 'rp1', kind: 'paid', amount: 3e6, currency: 'تومان', acct: 'بانک الف', category: 'اجاره', about: 'اجارهٔ ماهانه', date: today(), pending: true, settled: false, instrument: 'نقد/کارت', ...b });
    await putRaw('ledger', { id: 'rv1', kind: 'receivable', personId: 'kc', amount: 5e6, currency: 'تومان', category: 'فروش کالا', about: 'فاکتور ۱۰۱', date: addDays(today(), -10), due: addDays(today(), -1), settled: false, instrument: 'نسیه', ...b });
    await putRaw('ledger', { id: 'rv2', kind: 'receivable', personId: 'kd', amount: 5e6, currency: 'تومان', category: 'فروش کالا', about: 'فاکتور ۱۰۲', date: addDays(today(), -9), settled: false, instrument: 'نسیه', ...b });
    await putRaw('ledger', { id: 'rv3', kind: 'receivable', personId: 'kc', amount: 7e6, currency: 'تومان', category: 'فروش کالا', about: 'فاکتور ۱۰۳', date: addDays(today(), -8), settled: false, instrument: 'نسیه', ...b }); render(); });
  await inv('fixtures');
});

test('number guard: an amount, quantity or price the user did not say is cleared and flagged; said ones (any digits, million/thousand/toman, price × qty) are kept', async () => {
  const r = await p.evaluate(() => { const t = '۳ کیلو عسل گون به بهرام نمونه آزمون فروختم کلاً ۳٫۶ میلیون و ۵۰۰ هزار تومان هم گرفتم';
    return [asNorm({ intent: 'sale', person: 'بهرام نمونه آزمون', items: [{ desc: 'عسل گون', qty: 3, unit: 'کیلو', price: 1.2 }] }, t), asNorm({ intent: 'received', person: 'بهرام نمونه آزمون', amount: 0.5 }, t),
      asNorm({ intent: 'received', person: 'بهرام نمونه آزمون', amount: 9 }, t), asNorm({ intent: 'sale', items: [{ desc: 'عسل', qty: 40, price: 1.2 }] }, t), asNorm({ intent: 'drop_all', amount: 1 }, t), asNorm({ intent: 'task', title: 'x', due: 'روز نامعلوم' }, t)]; });
  assert(r[0].items[0].price === 1.2 && r[0].items[0].qty === 3 && r[0].pid === 'bn' && !r[0].issues.length, 'derived price: ' + JSON.stringify(r[0]));
  assert(r[1].amount === 0.5 && !r[1].issues.length, '«۵۰۰ هزار تومان» = 0.5 million: ' + JSON.stringify(r[1]));
  assert(r[2].amount === 0 && r[2].issues.some(x => x.includes('مبلغ')), 'invented amount kept: ' + JSON.stringify(r[2]));
  assert(r[3].items[0].qty === 0 && r[3].issues.length, 'invented quantity kept: ' + JSON.stringify(r[3]));
  assert(r[4].intent === 'unknown' && r[4].issues.length && r[5].due === '' && r[5].issues.length, 'whitelist / dates: ' + JSON.stringify([r[4], r[5]]));
});

test('without AI: one request with three parts → three proposals (task with date and person, a receipt with its amount, a note); nothing written', async () => {
  const s0 = await snap();
  await ask('فردا ساعت ۱۰ با بهرام نمونه آزمون تماس بگیرم؛ ۲ میلیون از کریم مشتری آزمون گرفتم و بعد یادداشت کن که انبار را مرتب کنم');
  const r = await p.evaluate(() => ({ acts: AS.acts.map(a => [a.intent, a.pid || '', a.amount, a.due]), cards: document.querySelectorAll('#aiOut [data-act=asGo]').length, tm: jShort(addDays(today(), 1)), via: AS.via }));
  assert(r.via === 'rules' && r.acts.length === 3 && r.acts[0][0] === 'task' && r.acts[0][1] === 'bn' && r.acts[0][3] === r.tm && r.acts[1][0] === 'received' && r.acts[1][1] === 'kc' && r.acts[1][2] === 2 && r.acts[2][0] === 'note' && r.cards === 3, 'plan: ' + JSON.stringify(r));
  const s1 = await snap(); assert(s0[0] === s1[0] && s0[1] === s1[1], 'proposing wrote data');
});

test('with AI: several actions; an invented amount is cleared; an ambiguous name asks for a choice; each financial action opens its form and saves exactly one row', async () => {
  const s0 = await snap();
  await ask('۲ میلیون به علی رضایی دادم و فردا با بهرام نمونه آزمون جلسه دارم', { actions: [{ intent: 'paid', person: 'علی رضایی', amount: 2, about: 'پرداخت' }, { intent: 'task', title: 'جلسه با بهرام', person: 'بهرام نمونه آزمون', due: 'فردا' }, { intent: 'received', person: 'بهرام نمونه آزمون', amount: 75 }] });
  let r = await p.evaluate(() => ({ acts: AS.acts.map(a => ({ it: a.intent, pid: a.pid || '', c: a.cands || [], amt: a.amount, iss: a.issues })), pick: [...document.querySelectorAll('#aiOut [data-act=asPick]')].map(b => b.dataset.v), via: AS.via }));
  assert(r.via === 'ai' && r.acts.length === 3, 'plan: ' + JSON.stringify(r));
  assert(!r.acts[0].pid && r.acts[0].c.length === 2 && r.acts[0].iss.some(x => x.includes('نفر')) && r.pick.length === 2, 'ambiguous person: ' + JSON.stringify(r.acts[0]));
  assert(r.acts[2].amt === 0 && r.acts[2].iss.some(x => x.includes('مبلغ')), 'invented 75 kept: ' + JSON.stringify(r.acts[2]));
  const s1 = await snap(); assert(s0[1] === s1[1], 'proposing wrote data');
  await act('asPick', { v: '0|a2' }); r = await p.evaluate(() => AS.acts[0].pid); assert(r === 'a2', 'pick: ' + r);
  const n0 = await p.evaluate(() => S.ledger.length);
  await act('asGo', { v: '0' }); await p.waitForSelector('#sheetRoot form[data-form=ledger]');
  await p.waitForFunction(() => (document.getElementById('f_amt') || {}).value, null, { timeout: 3000 }).catch(() => {});   // the form fills the amount a moment after it opens
  const f = await p.evaluate(() => ({ amt: document.getElementById('f_amt').value, kind: (document.getElementById('f_kind') || {}).value, person: (document.getElementById('f_person') || {}).value }));
  assert(f.amt === '۲' && f.kind === 'paid' && f.person === 'a2', 'form not prefilled: ' + JSON.stringify(f));
  assert((await p.evaluate(() => S.ledger.length)) === n0, 'opening the form wrote a row');
  await p.evaluate(() => { for (const [id, v] of [['f_acct', 'بانک الف'], ['f_cat', 'شخصی: سایر']]) { const e = document.getElementById(id); if (!e) continue; if (e.tagName === 'SELECT' && ![...e.options].some(o => o.value === v)) e.add(new Option(v, v)); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); } });
  await submitForm(p); await settle(p);
  const add = await p.evaluate(n0 => S.ledger.slice(n0).map(l => [l.kind, l.amount, l.personId]), n0);
  assert(JSON.stringify(add) === JSON.stringify([['paid', 2e6, 'a2']]), 'rows written: ' + JSON.stringify(add));
  await inv('after the confirmed payment');
  await p.evaluate(() => { closeSheet(); goTab('today'); }); await p.waitForSelector('#view [data-act=asOpen]', { state: 'attached', timeout: 3000 }).catch(() => {});
  const today = await p.evaluate(() => { const b = document.querySelector('#view [data-act=asOpen]'); return b ? b.textContent : ''; });
  assert(today.includes('۲') && today.includes('دستیار'), 'Today does not offer the remaining proposals: ' + today);
});

test('clinical text goes to the AI only after de-identification; a visit is never recorded by the assistant itself', async () => {
  await ask('ویزیت علی رضایی آزمون فردا ساعت ۵ در مطب', { actions: [{ intent: 'visit', person: 'مراجع' }] });
  const r = await p.evaluate(() => ({ sent: window._aiSent.join(' '), it: AS.acts[0].intent }));
  assert(!r.sent.includes('رضایی') && r.it === 'visit', 'sent to AI: ' + r.sent);
  const n0 = await p.evaluate(() => S.visits.length + S.cases.length); await act('asGo', { v: '0' }); await p.waitForTimeout(200);
  assert((await p.evaluate(() => S.visits.length + S.cases.length)) === n0, 'a visit was written');
});

test('several tasks at once after one tap; pressing again or an existing open task with the same title and day makes no duplicate; they sync like any task', async () => {
  await p.evaluate(async () => { const n = nowTs(); await putRaw('tasks', { id: 'tx', title: 'خرید شیشه', due: addDays(today(), 1), status: 'open', created: n, updated: n }); });
  await ask('فردا خرید شیشه\nفردا تماس با بهرام نمونه آزمون\nفردا بردن عسل به انبار');
  const n0 = await p.evaluate(() => S.tasks.length); await act('asTasks'); await settle(p); await act('asTasks'); await settle(p);
  const r = await p.evaluate(n0 => ({ added: S.tasks.slice(n0).map(t => t.title), glass: S.tasks.filter(t => t.title.includes('شیشه')).length }), n0);
  assert(r.added.length === 2 && r.glass === 1, 'tasks: ' + JSON.stringify(r));
  const m = await p.evaluate(async () => { const before = S.tasks.length; GH.cfg = { ...GH.cfg, syncAt: nowTs() }; const n = await syncMerge(syncData().data); return { n, same: S.tasks.length === before, conf: openConf().length }; });
  assert(m.n === 0 && m.same && m.conf === 0, 'merging the same data again: ' + JSON.stringify(m));
});

test('one input: a bank message goes to the receipt page, a bill to the bill page, a question to the answers, a shared sentence fills the assistant box (read only after «بفهم»)', async () => {
  await ask('برداشت ۳۰,۰۰۰,۰۰۰ ریال از حساب شما. مانده ۱۲,۰۰۰,۰۰۰'); assert(await p.evaluate(() => document.getElementById('sheetRoot').innerText.includes('رسید یا پیام بانک')), 'bank message not routed');
  await ask('قبض برق شناسه قبض 1234567890 شناسه پرداخت 12345678 مبلغ 1,250,000 ریال'); assert(await p.evaluate(() => !document.getElementById('sheetRoot').innerText.includes('بگو چه کار کنم')), 'bill not routed');
  await ask('طلب‌هایم چقدر است؟'); assert(await p.evaluate(() => /طلب تو|طلب یا بدهی/.test(document.getElementById('aiOut').innerText)), 'question not answered');
  await p.evaluate(async () => { const c = await caches.open('miz-share'); await c.put('share-text', new Response('فردا با کریم مشتری آزمون تماس بگیرم')); history.replaceState(null, '', location.pathname + '?share=1'); closeSheet(); await checkShared(); });
  await p.waitForTimeout(200);
  let r = await p.evaluate(() => ({ t: document.getElementById('sheetRoot').innerText.includes('بگو چه کار کنم'), box: document.getElementById('f_ais').value, as: AS }));
  assert(r.t && r.box.includes('کریم مشتری آزمون') && !r.as, 'shared sentence must only fill the box: ' + JSON.stringify(r));
  await p.evaluate(() => document.querySelector('#sheetRoot form[data-form=aisay] button.pri').click()); await p.waitForTimeout(250);
  r = await p.evaluate(() => ({ a: AS && AS.acts[0] && AS.acts[0].intent, pid: AS && AS.acts[0] && AS.acts[0].pid }));
  assert(r.a === 'task' && r.pid === 'kc', 'after «بفهم»: ' + JSON.stringify(r));
});

test('bank message matching: a pending recurring payment is offered and confirmed without a new row; same-amount open invoices are all listed for the user to choose; a same-amount row recorded today warns of a duplicate', async () => {
  await p.evaluate(() => { closeSheet(); receiptSheet('برداشت ۳۰,۰۰۰,۰۰۰ ریال از حساب شما', null); });
  let r = await p.evaluate(() => ({ ok: [...document.querySelectorAll('#sheetRoot [data-act=rcptPend]')].map(b => b.dataset.id), dup: document.getElementById('sheetRoot').innerText.includes('تکراری') }));
  assert(JSON.stringify(r.ok) === '["rp1"]' && !r.dup, 'recurring: ' + JSON.stringify(r));
  const n0 = await p.evaluate(() => S.ledger.length); await act('rcptPend', { id: 'rp1' }); await settle(p);
  assert((await p.evaluate(n0 => S.ledger.length === n0 && byId('ledger', 'rp1').pending === false, n0)), 'confirming changed the row count or did not confirm');
  await p.evaluate(() => { closeSheet(); receiptSheet('برداشت ۳۰,۰۰۰,۰۰۰ ریال از حساب شما', null); });
  r = await p.evaluate(() => ({ ok: document.querySelectorAll('#sheetRoot [data-act=rcptPend]').length, dup: /تکراری|قبلاً ثبت شده/.test(document.getElementById('sheetRoot').innerText) }));
  assert(r.ok === 0 && r.dup, 'after confirming, the same message must warn of a duplicate: ' + JSON.stringify(r));
  await p.evaluate(async () => { const n = nowTs(); await putRaw('ledger', { id: 'mp1', kind: 'paid', amount: 1.5e6, currency: 'تومان', acct: 'بانک الف', category: 'اجاره', about: 'ثبت دستی', date: today(), settled: false, void: false, instrument: 'نقد/کارت', created: n, updated: n }); closeSheet(); receiptSheet('برداشت ۱۵,۰۰۰,۰۰۰ ریال از حساب شما', null); });
  assert(await p.evaluate(() => document.getElementById('sheetRoot').innerText.includes('تکراری')), 'same-amount row of today not warned as a possible duplicate');
  await p.evaluate(() => { closeSheet(); receiptSheet('واریز ۵۰,۰۰۰,۰۰۰ ریال به حساب شما', null); });
  r = await p.evaluate(() => ({ st: [...document.querySelectorAll('#sheetRoot [data-act=settle]')].map(b => b.dataset.id).sort(), many: document.getElementById('sheetRoot').innerText.includes('خودت انتخاب کن') }));
  assert(JSON.stringify(r.st) === '["rv1","rv2"]' && r.many, 'open invoices: ' + JSON.stringify(r));
  const s0 = await snap(); await p.evaluate(() => closeSheet()); const s1 = await snap(); assert(s0[1] === s1[1], 'showing matches wrote data');
  await inv('after matching');
});

test('search answers for cheques and a person\'s statement; weekly review shows cheques, pending confirmations, receivables without follow-up and the money of the week — and writes nothing', async () => {
  await p.evaluate(async () => { const n = nowTs(); await putRaw('cheques', { id: 'cq', dir: 'in', personId: 'kc', amount: 4e6, due: addDays(today(), 2), no: '777', status: 'wait', hist: [], created: n, updated: n, void: false }); });
  const a = await p.evaluate(() => [askAnswer('چک‌های این هفته چیست؟'), askAnswer('صورت حساب کریم مشتری آزمون چطور است؟'), moneyFull(4e6, 'تومان'), moneyFull(12e6, 'تومان')]);
  assert(a[0].includes(a[2]) && a[0].includes('کریم'), 'cheques answer: ' + a[0].replace(/<[^>]+>/g, ' '));
  assert(a[1].includes('پایان') && a[1].includes(a[3]), 'statement answer: ' + a[1].replace(/<[^>]+>/g, ' '));
  const s0 = await snap(); await p.evaluate(() => { closeSheet(); reviewSheet(); }); await p.waitForTimeout(100);
  const t = await p.evaluate(() => document.getElementById('sheetRoot').innerText);
  assert(t.includes('چک‌های این هفته') && t.includes('طلب‌های سررسیده بدون پیگیری') && t.includes('پول این هفته') && t.includes('کریم'), 'review: ' + t.slice(0, 500));
  const s1 = await snap(); assert(s0[1] === s1[1], 'the review wrote data'); await p.evaluate(() => closeSheet());
});

test('no page errors, nothing sent', async () => { assert(!o.errors.length, o.errors.join(' | ')); assert(!o.net.external.length, o.net.external.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
