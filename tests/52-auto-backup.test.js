// Automatic local backups (js/backup.js): every copy is verified, identical copies are not stored twice, retention never drops the
// newest daily copy or the copy with the most rows, fewer copies under storage pressure, a damaged copy is marked and never restored,
// a copy is taken on the first start of a new version and before the update button reloads, and a copy really restores lost rows.
// Synthetic data only; nothing leaves the page.
const { serve, launch, openApp, ready, test, run, assert } = require('./lib');
let srv;
const toastHas = (p, re) => p.waitForFunction(re => new RegExp(re).test([...document.querySelectorAll('.toast,#toast')].map(x => x.textContent).join(' ')), re, { timeout: 5000 }).then(() => true).catch(() => false);
const addPerson = (p, name) => p.evaluate(n => save('people', null, { name: n }), name);
const list = p => p.evaluate(async () => (await snapList()).map(s => ({ id: s.id, reason: s.reason, n: s.n, ok: snapCheck(s) })));
async function fresh() { const o = await launch(); await openApp(o, srv.url); await o.page.waitForTimeout(300); await o.page.evaluate(async () => { const d = await snapOpen(); await new Promise(r => { const t = d.transaction('snaps', 'readwrite'); t.objectStore('snaps').clear(); t.oncomplete = r; }); }); return o; }

test('setup', async () => { srv = await serve(); });

test('a copy is verified after writing; an identical copy is not stored again; changed data gives a new copy', async () => {
  const o = await fresh(); const p = o.page; await addPerson(p, 'شخص پشتیبان یک');
  const a = await p.evaluate(() => snapTake('manual')), b = await p.evaluate(() => snapTake('manual'));
  let L = await list(p); assert(a && a === b && L.length === 1 && L[0].ok, 'identical copy stored twice or not verified: ' + JSON.stringify({ a, b, L }));
  await addPerson(p, 'شخص پشتیبان دو'); const c = await p.evaluate(() => snapTake('manual'));
  L = await list(p); assert(c && c !== a && L.length === 2 && L.every(x => x.ok), 'changed data did not give a new verified copy: ' + JSON.stringify(L));
  // the newest copy is damaged (same fingerprint): a new, good copy is made instead of trusting it
  await p.evaluate(async id => { const s = await snapGet(id); s.txt = s.txt.slice(0, 50); const d = await snapOpen(); await new Promise(r => { const t = d.transaction('snaps', 'readwrite'); t.objectStore('snaps').put(s); t.oncomplete = r; }); }, c);
  const e = await p.evaluate(() => snapTake('manual')); L = await list(p);
  assert(e && e !== c && L.find(x => x.id === e).ok && !L.find(x => x.id === c).ok, 'a damaged newest copy was trusted: ' + JSON.stringify({ e, L }));
  assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close();
});

test('retention: at most 10 copies; the newest daily copy and the copy with the most rows are never pushed out; 5 under storage pressure', async () => {
  const o = await fresh(); const p = o.page; await addPerson(p, 'شخص نگهداری');
  for (let i = 0; i < 4; i++) await addPerson(p, 'شخص پرداده ' + i);
  const big = await p.evaluate(() => snapTake('del'));
  // the data then shrinks (synthetic: rows removed from memory only) and a daily copy is made
  await p.evaluate(() => { S.people = S.people.slice(0, 1); }); const daily = await p.evaluate(() => snapTake('daily'));
  for (let i = 0; i < 12; i++) { await p.evaluate(i => { S.people[0] = { ...S.people[0], note: 'تغییر ' + i }; }, i); await p.evaluate(() => snapTake('del')); }
  let L = await list(p); const ids = L.map(x => x.id);
  assert(L.length === 10 && ids.includes(big) && ids.includes(daily), 'retention lost the largest or the daily copy: ' + JSON.stringify(L.map(x => x.reason + ':' + x.n)));
  await p.evaluate(() => { navigator.storage.estimate = async () => ({ usage: 90, quota: 100 }); S.people[0] = { ...S.people[0], note: 'فشار' }; });
  await p.evaluate(() => snapTake('del')); L = await list(p); const ids2 = L.map(x => x.id);
  assert(L.length === 5 && ids2.includes(big) && ids2.includes(daily), 'storage pressure: ' + JSON.stringify(L.map(x => x.reason + ':' + x.n)));
  await o.ctx.close();
});

test('a damaged copy is marked in the list and cannot be opened for restore', async () => {
  const o = await fresh(); const p = o.page; await addPerson(p, 'شخص خراب');
  const id = await p.evaluate(() => snapTake('manual'));
  await p.evaluate(async id => { const s = await snapGet(id); s.counts = { ...s.counts, people: 99 }; const d = await snapOpen(); await new Promise(r => { const t = d.transaction('snaps', 'readwrite'); t.objectStore('snaps').put(s); t.oncomplete = r; }); }, id);
  await p.evaluate(() => snapsSheet()); await p.waitForSelector('#sheetRoot [data-act=snapView]');
  assert(await p.evaluate(() => document.querySelector('#sheetRoot').textContent.includes('خراب')), 'damaged copy not marked');
  await p.evaluate(id => snapView(id), id); assert(await toastHas(p, 'خراب'), 'no warning for a damaged copy');
  assert(!(await p.$('#sheetRoot [data-act=snapApply]')), 'a damaged copy offered restore');
  await o.ctx.close();
});

test('first start of a new version takes a copy before anything else; a fresh install does not; the update button takes one before reloading', async () => {
  const o = await fresh(); const p = o.page; await addPerson(p, 'شخص ارتقا');
  assert(await p.evaluate(() => localStorage.getItem('miz.ranVer') === APP_VER), 'fresh install did not record the version');
  assert(!(await list(p)).some(x => x.reason === 'upgrade'), 'fresh install took an «upgrade» copy');
  await p.evaluate(() => localStorage.setItem('miz.ranVer', '4.32')); await p.reload(); await ready(p);
  await p.waitForFunction(async () => (await snapList()).some(s => s.reason === 'upgrade'), null, { timeout: 5000 }).catch(() => {});
  let L = await list(p); const up = L.find(x => x.reason === 'upgrade');
  assert(up && up.ok && up.n >= 1 && await p.evaluate(() => localStorage.getItem('miz.ranVer') === APP_VER), 'no verified copy on the first start of a new version: ' + JSON.stringify(L));
  await addPerson(p, 'شخص به‌روزرسانی'); await p.evaluate(() => { window.stashLatest = async () => true; });
  await Promise.all([p.waitForNavigation({ timeout: 8000 }).catch(() => {}), p.evaluate(() => doUpdate())]); await ready(p);
  L = await list(p); assert(L.some(x => x.reason === 'update' && x.ok), 'the update button did not take a copy: ' + JSON.stringify(L));
  await o.ctx.close();
});

test('restore from a copy: a deleted person comes back with «only missing rows»; the backup page shows the copy status', async () => {
  const o = await fresh(); const p = o.page; await addPerson(p, 'شخص بازگشتی');
  const id = await p.evaluate(() => snapTake('manual')); const pid = await p.evaluate(() => S.people.find(x => x.name === 'شخص بازگشتی').id);
  await p.evaluate(id => delDoc('people', id), pid); assert(await p.evaluate(id => !byId('people', id), pid), 'not deleted');
  await p.evaluate(id => snapView(id), id); await p.waitForSelector('#sheetRoot [data-act=snapApply][data-v=miss]');
  await p.click('#sheetRoot [data-act=snapApply][data-v=miss]'); await p.waitForTimeout(800);
  const ok = await p.evaluate(id => !!byId('people', id), pid); assert(ok, 'the deleted person did not come back from the copy');
  await p.evaluate(() => { closeSheet(); backupSheet(); }); await p.waitForFunction(() => /نسخهٔ خودکار: آخرین .*سالم/.test((document.getElementById('bkAuto') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const t = await p.evaluate(() => document.getElementById('bkAuto').textContent); assert(/سالم/.test(t), 'backup page status: ' + t);
  assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close();
});

test('cleanup', async () => { await srv.close(); });
run(__filename);
