// Store.tx (js/store.js): a write reaches memory (S), undo, dirty state and the screen only after the IndexedDB transaction
// completed; an aborted transaction or a write failure (simulated quota error) leaves memory AND the database unchanged; save0 and
// putRaw keep their behaviour (save returns false with a message, putRaw throws); writes are serialised. Synthetic data only.
const { serve, launch, openApp, settle, invariants, test, run, assert } = require('./lib');
let srv, o, p;
const disk = id => p.evaluate(id => new Promise(r => { const q = idb.transaction('docs').objectStore('docs').get('people/' + id); q.onsuccess = () => r(q.result ? q.result.doc : null); }), id);
// fault injection on the real IndexedDB objects (test page only): mode 'abort' aborts the transaction right after the write
// request; mode 'quota' makes put() throw a QuotaExceededError
const fault = mode => p.evaluate(mode => { const P = IDBObjectStore.prototype; if (!window._origPut) window._origPut = P.put;
  P.put = mode === 'quota' ? function () { throw new DOMException('synthetic quota', 'QuotaExceededError'); }
    : mode === 'abort' ? function (...a) { const r = window._origPut.apply(this, a); this.transaction.abort(); return r; } : window._origPut; }, mode);
test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(() => save('people', null, { name: 'شخص ذخیره' })); await settle(p); });
test('successful single-record writes: save0 (new + update) and putRaw reach disk and memory', async () => {
  const id = await p.evaluate(() => S.people.find(x => x.name === 'شخص ذخیره').id);
  assert(await p.evaluate(id => save('people', id, { note: 'یک' }), id), 'save returned false');
  assert((await disk(id)).note === 'یک' && await p.evaluate(id => byId('people', id).note === 'یک', id), 'update not on disk/memory');
  await p.evaluate(() => putRaw('people', { id: 'p_raw', name: 'خام', created: nowTs(), updated: nowTs() }));
  assert((await disk('p_raw')).name === 'خام' && await p.evaluate(() => !!byId('people', 'p_raw')), 'putRaw');
  await p.reload(); await settle(p); assert(await p.evaluate(id => byId('people', id).note === 'یک' && !!byId('people', 'p_raw'), id), 'not persisted after reload');
});
for (const mode of ['abort', 'quota']) test(`${mode}: save returns false, putRaw throws; memory, undo/dirty counter and database unchanged`, async () => {
  const id = await p.evaluate(() => S.people.find(x => x.name === 'شخص ذخیره').id);
  const before = await p.evaluate(id => { window._uc = 0; if (!window._undoReal) { window._undoReal = undoRec; window.undoRec = (...a) => { window._uc++; return window._undoReal(...a); }; } return { m: JSON.stringify(byId('people', id)), n: S.people.length, dv: window._dv || 0, un: localStorage.getItem('miz.unsent') }; }, id); const d0 = JSON.stringify(await disk(id));
  await fault(mode);
  const r = await p.evaluate(async id => { const a = await save('people', id, { note: 'نباید بماند' }); const b = await save('people', null, { name: 'تازهٔ ناموفق' });
    let c = 'no throw'; try { await putRaw('people', { id: 'p_fail', name: 'x' }); } catch (e) { c = e.name || 'threw'; } return { a, b, c }; }, id);
  await fault('off');
  const after = await p.evaluate(id => ({ m: JSON.stringify(byId('people', id)), n: S.people.length, dv: window._dv || 0, un: localStorage.getItem('miz.unsent'), fail: !!byId('people', 'p_fail'), uc: window._uc }), id);
  assert(after.uc === 0 && after.un === before.un, 'undo recorded or unsent counter changed on failure: ' + JSON.stringify({ before, after }));
  assert(r.a === false && r.b === false && r.c !== 'no throw', 'results: ' + JSON.stringify(r));
  delete after.uc; delete before.un; delete after.un;
  assert(after.m === before.m && after.n === before.n && after.dv === before.dv && !after.fail, 'memory changed: ' + JSON.stringify({ before, after }));
  assert(JSON.stringify(await disk(id)) === d0 && !(await disk('p_fail')), 'database changed');
  if (mode === 'quota') assert(await p.evaluate(() => [...document.querySelectorAll('.toast,#toast')].some(x => /ظرفیت/.test(x.textContent))), 'quota message not shown');
});
test('serialised: two concurrent saves to one record both land (no lost update); invariants; no page errors', async () => {
  const id = await p.evaluate(() => S.people.find(x => x.name === 'شخص ذخیره').id);
  await p.evaluate(id => Promise.all([save('people', id, { org: 'الف' }), save('people', id, { email: 'b@x.test' })]), id);
  const d = await disk(id); assert(d.org === 'الف' && d.email === 'b@x.test' && await p.evaluate(id => byId('people', id).org === 'الف' && byId('people', id).email === 'b@x.test', id), 'lost update: ' + JSON.stringify(d));
  const v = await invariants(p); assert(!v.length, v.join('; ')); assert(!o.errors.length, o.errors.join(' | '));
});
test('success records undo and the unsent counter; w.del deletes in the same transaction; a failing memory callback reloads memory from disk', async () => {
  const r = await p.evaluate(async () => { window._uc = 0; const u0 = Number(localStorage.getItem('miz.unsent') || 0);
    await save('people', null, { name: 'شمارش' }); const u1 = Number(localStorage.getItem('miz.unsent') || 0);
    const a = await Store.tx(w => { w.put('people', { id: 'p_d1', name: 'حذفی' }); w.put('people', { id: 'p_d2', name: 'ماندنی' }); });
    const b = await Store.tx(w => { w.del('people', 'p_d1'); });
    const get = id => new Promise(r => { const q = idb.transaction('docs').objectStore('docs').get('people/' + id); q.onsuccess = () => r(q.result ? q.result.doc : null); });
    const d1 = await get('p_d1'), d2 = await get('p_d2');
    const c = await Store.tx(w => { w.put('people', { id: 'p_cb', name: 'دیسک' }); w.after(() => { S.people.push({ id: 'p_cb', name: 'نیمه' }); throw new Error('synthetic callback failure'); }); });
    const mem = S.people.filter(x => x.id === 'p_cb');
    return { uc: window._uc, du: u1 - u0, a: a.ok, b: b.ok, d1: !!d1, d2: !!d2, c: { ok: c.ok, err: !!c.afterError }, mem: mem.map(x => x.name) }; });
  assert(r.uc >= 1 && r.du === 1, 'undo / unsent on success: ' + JSON.stringify(r));
  assert(r.a && r.b && !r.d1 && r.d2, 'w.del: ' + JSON.stringify(r));
  assert(r.c.ok && r.c.err && r.mem.length === 1 && r.mem[0] === 'دیسک', 'callback failure not resynced from disk: ' + JSON.stringify(r));
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
