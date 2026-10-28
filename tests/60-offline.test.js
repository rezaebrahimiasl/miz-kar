// Offline-first guarantees. Service worker enabled; the browser is put in airplane mode with setOffline(true).
const fs = require('fs'), path = require('path'), os = require('os');
const { serve, launch, openApp, ready, openDoc, submit, sig, test, run, assert, tempProfile } = require('./lib');
let srv, profile, before;
const reopen = async offline => { const o = await launch({ sw: true, offline, profile }); await o.page.goto(srv.url).catch(() => {}); return o; };

test('install: first online visit caches the app shell', async () => {
  srv = await serve(); profile = tempProfile('miz-off-');   // reused across launches; removed by lib.js when the file ends
  const o = await launch({ sw: true, profile }); await openApp(o, srv.url);
  await o.page.evaluate(() => navigator.serviceWorker.ready); await o.page.reload(); await ready(o.page);
  assert(await o.page.evaluate(() => !!navigator.serviceWorker.controller), 'page not controlled by the service worker');
  const miss = await o.page.evaluate(async () => { const need = ['index.html', 'qr.js', 'logo.webp', 'manifest.webmanifest', 'icon2-192.png'];
    const out = []; for (const f of need) if (!(await caches.match(f, { ignoreSearch: true }))) out.push(f); return out; });
  assert(!miss.length, 'not cached: ' + miss.join(', ')); await o.ctx.close();
});

test('airplane mode: cold launch opens the app from cache', async () => {
  const o = await reopen(true); await ready(o.page);
  assert(await o.page.evaluate(() => !navigator.onLine), 'browser was not offline'); await o.ctx.close();
});

test('airplane mode: create and edit people, tasks, documents, stock, money, clinic records', async () => {
  const o = await reopen(true); await ready(o.page); const p = o.page;
  await p.evaluate(async () => {
    await save('people', null, { name: 'آزمون آفلاین' }); const pid = S.people.find(x => x.name === 'آزمون آفلاین').id;
    await save('tasks', null, { title: 'کار آفلاین', due: today(), status: 'open', priority: 3 });
    await save('cases', null, { code: 'OFF-1', personId: pid, complaint: 'SYN-OFF', status: 'open' });
    await save('visits', null, { caseId: S.cases[0].id, no: 1, date: today(), obs: 'SYN-OFF-V' });
    await save('ledger', null, { kind: 'paid', amount: 3e6, currency: 'تومان', about: 'هزینهٔ آفلاین', category: 'اجاره', date: today(), settled: false, void: false });
    const t = S.tasks.find(x => x.title === 'کار آفلاین'); await save('tasks', t.id, { title: 'کار آفلاین ✎' }); });
  await openDoc(p, { type: 'purchase', personId: await p.evaluate(() => S.people[0].id), led: 'payable', items: [{ desc: 'عسل آفلاین', qty: 20, unit: 'کیلو', price: 0.5e6 }] }); await submit(p);
  await openDoc(p, { type: 'invoice', personId: await p.evaluate(() => S.people[0].id), led: 'receivable', items: [{ desc: 'عسل آفلاین', qty: 5, unit: 'کیلو', price: 1e6, src: 'lot', lotId: await p.evaluate(() => S.lots[0].id) }] }); await submit(p);
  before = await sig(p);
  assert(await p.evaluate(() => lotStat(S.lots[0]).rem === 15 && S.tasks.some(t => t.title === 'کار آفلاین ✎')), 'records not as expected');
  assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close();
});

test('close and reopen offline: every change persisted', async () => {
  const o = await reopen(true); await ready(o.page); assert((await sig(o.page)) === before, 'data differs after reopen'); await o.ctx.close();
});

test('reconnect: no duplicate records, nothing uploaded without a configured and consented integration', async () => {
  const o = await reopen(false); await ready(o.page);
  await o.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await o.page.reload(); await ready(o.page);
  assert((await sig(o.page)) === before, 'data changed after reconnect');
  const up = o.net.external.filter(x => /^(PUT|POST|PATCH)/.test(x)); assert(!up.length, 'uploads: ' + up.join(' | '));
  await o.ctx.close(); srv.close();
});

run(__filename);
