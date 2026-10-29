// v4.28: «امروز» puts work first (prayers stay on top; overdue/today tasks and due follow-ups come before system
// reminders), the weekly-review reminder really shows, and invoices/documents and display settings are easy to find.
// Phone-sized, synthetic data only.
const { serve, launch, openApp, test, run, assert } = require('./lib');
let srv, o, p;

test('Today: prayers → tasks → follow-ups → «نیاز به توجه» → tip; the first overdue task is on the first screen', async () => {
  srv = await serve(); o = await launch(); p = o.page; await openApp(o, srv.url);
  await p.evaluate(async () => { const n = nowTs(), d = k => addDays(today(), k), b = { created: n, updated: n };
    for (const [id, title, due, pr] of [['ta', 'پیگیری طلب آزمون', d(-3), 1], ['tb', 'تماس آزمون', d(-1), 3], ['tc', 'کار امروز آزمون', d(0), 3], ['td', 'کار هفتهٔ بعد', d(6), 3]])
      await putRaw('tasks', { id, title, due, status: 'open', priority: pr, ...b });
    await putRaw('people', { id: 'pz', name: 'مشتری آزمون', ...b });
    await putRaw('deals', { id: 'dz', title: 'فرصت آزمون', personId: 'pz', nextStep: 'تماس دوباره', nextDate: d(-1), status: 'open', pipe: Object.keys(PIPES)[0], ...b });
    closeSheet(); goTab('today'); });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => { const v = document.getElementById('view'), y = el => el ? Math.round(el.getBoundingClientRect().top + scrollY) : -1;
    const head = t => [...v.querySelectorAll('h2,.ttl,b,span')].find(x => x.textContent.trim().startsWith(t));
    const task = [...v.querySelectorAll('.ttl')].find(x => x.textContent.includes('پیگیری طلب آزمون'));
    return { prayer: y([...v.querySelectorAll('*')].find(x => !x.children.length && /نماز/.test(x.textContent))), top3: y(head('سه کار مهم امروز')), follow: y(head('پیگیری‌های سررسیده')),
      attn: y(document.getElementById('attnBox')), tip: y([...v.querySelectorAll('*')].find(x => !x.children.length && x.textContent.trim() === 'نکته')), task: y(task), vh: innerHeight,
      review: !!document.querySelector('#attnBox [data-act=review]'), safety: !!document.querySelector('#attnBox') && /پشتیبان/.test(document.getElementById('attnBox').textContent) }; });
  assert(r.prayer >= 0 && r.top3 > r.prayer && r.follow > r.top3 && r.attn > r.follow, 'order: ' + JSON.stringify(r));
  assert(r.tip < 0 || r.tip > r.attn, 'tip before the work: ' + JSON.stringify(r));
  assert(r.task > 0 && r.task < r.vh, `first overdue task at y=${r.task}, screen ${r.vh}`);
  assert(r.safety, 'backup warning no longer shown on Today');
  assert(r.review, 'weekly-review reminder still not shown (it was added after the block was drawn)');
  assert(!o.errors.length, o.errors.join(' | '));
});

test('Navigation: «فاکتورها و اسناد» is on the money tab and in «بیشتر»; «نما و نمایش صفحه‌ها» is under «تنظیمات»; the search box says what it finds', async () => {
  await p.evaluate(() => { closeSheet(); goTab('money'); });
  const money = await p.evaluate(() => { const b = document.querySelector('#view [data-act=docsSheet]'); return b && b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().bottom <= innerHeight; });
  assert(money, 'no visible «فاکتورها و اسناد» on the money tab');
  await p.click('#view [data-act=docsSheet]'); await p.waitForSelector('#sheetRoot [data-act=docSearch]');
  const menu = await p.evaluate(() => { closeSheet(); menuSheet(); const grp = [...document.querySelectorAll('#sheetRoot .grp')]; const tilesOf = g => { const e = grp.find(x => x.textContent.trim() === g); return e ? [...e.nextElementSibling.querySelectorAll('[data-act]')].map(x => x.dataset.act) : []; };
    return { money: tilesOf('پول و کسب‌وکار'), settings: tilesOf('تنظیمات') }; });
  assert(menu.money.includes('docsSheet') && menu.settings.includes('viewPanel'), 'menu: ' + JSON.stringify(menu));
  const ph = await p.evaluate(() => { closeSheet(); searchSheet(); return document.getElementById('gq').placeholder; });
  assert(/فاکتور/.test(ph) && /چک/.test(ph), 'search placeholder: ' + ph);
  // a question offers the AI assistant only when it is set up, and only as a button (nothing is sent by typing)
  const ask = q => p.evaluate(q => { document.getElementById('gq').value = q; runSearch(q); const b = document.querySelector('#gres [data-act=aiAskQ]'); return b ? b.dataset.v : null; }, q);
  assert((await ask('به مشتری آزمون چقدر بدهکارم؟')) === null, 'AI offered without a key');
  await p.evaluate(() => localStorage.setItem('miz.ai', JSON.stringify({ key: 'SYNTHETIC-NOT-A-KEY', on: true })));
  assert((await ask('به مشتری آزمون چقدر بدهکارم؟')) === 'به مشتری آزمون چقدر بدهکارم؟' && (await ask('مشتری آزمون')) === null, 'AI button for questions only');
  await p.evaluate(() => localStorage.removeItem('miz.ai'));
  assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close(); await srv.close();
});

run(__filename);
