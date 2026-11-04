// The six issues of the independent review of fb62f06: confPick does not mutate the conflict list before staging; sync is quiet per
// operation (no global flag while it waits); delDoc's delete, tombstone and undo entry are one operation (trash/drafts after it);
// the restore plan is made inside the operation (no stale overwrite); a failed undo keeps the undo for a retry; cloud mode refuses
// multi-record operations instead of running them half. Failure injection everywhere; memory and database compared. Synthetic.
const { serve, launch, openApp, settle, invariants, test, run, assert } = require('./lib');
let srv, o, p;
const mem = () => p.evaluate(() => JSON.stringify(COLS.filter(c => c !== 'contacts').map(c => (S[c] || []).map(x => JSON.stringify(x)).sort())));
const disk = () => p.evaluate(() => new Promise(r => { const q = idb.transaction('docs').objectStore('docs').getAll(); q.onsuccess = () => r(JSON.stringify(q.result.filter(x => x.col !== 'contacts').map(x => x.k + JSON.stringify(x.doc)).sort())); }));
const fail = on => p.evaluate(on => { if (!window._st) { window._st = Store.stage; window._sd = Store.stageDel; }
  Store.stage = on ? function (B, col, doc) { if (on === 'any' || col + '/' + doc.id === on) throw new Error('synthetic failure'); return window._st.apply(this, arguments); } : window._st;
  Store.stageDel = on === 'any' ? function () { throw new Error('synthetic failure'); } : window._sd; }, on);
async function same(what, fn) { const m0 = await mem(), d0 = await disk(); await fn(); await settle(p); assert((await mem()) === m0, what + ': memory changed'); assert((await disk()) === d0, what + ': database changed'); }
test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page; await p.evaluate(() => setSM('undo', true));
  await p.evaluate(async () => { const n = nowTs(); for (const id of ['p1', 'p2', 'p3', 'p4']) await putRaw('people', { id, name: 'شخص ' + id, created: n, updated: n }); });
  await p.reload(); await settle(p); });

test('1 confPick: failure while staging the records or the conflict list → memory (incl. the list) and database unchanged; success closes it in both', async () => {
  await p.evaluate(async () => { const t = nowTs(); await putRaw('meta', { id: 'conflicts', list: [{ key: 'people/p1', col: 'people', id: 'p1', local: byId('people', 'p1'), remote: { ...byId('people', 'p1'), name: 'از دستگاه دیگر' }, at: t, open: true }], created: t, updated: t }); });
  for (const at of ['people/p1', 'meta/conflicts']) { await fail(at); await same('confPick failure at ' + at, () => p.evaluate(() => confPick('people/p1', 'remote'))); await fail(null); }
  // failure at the commit itself (after the list was staged): the list in memory must not stay «closed»
  await p.evaluate(() => { const P = IDBObjectStore.prototype; window._op = window._op || P.put; P.put = function () { throw new DOMException('synthetic quota', 'QuotaExceededError'); }; });
  await same('confPick failure at commit', () => p.evaluate(() => confPick('people/p1', 'remote'))); await p.evaluate(() => { IDBObjectStore.prototype.put = window._op; });
  assert(await p.evaluate(() => CONF().filter(x => x.open).length === 1), 'conflict list in memory closed after a failed commit');
  await p.evaluate(() => confPick('people/p1', 'remote')); await settle(p);
  const r = await p.evaluate(() => ({ open: CONF().filter(x => x.open).length, name: byId('people', 'p1').name }));
  const d = JSON.parse(await disk()).find(x => x.startsWith('meta/conflicts')); assert(r.open === 0 && r.name === 'از دستگاه دیگر' && d && !/"open":true/.test(d), 'success: ' + JSON.stringify(r));
});

test('2 sync queued behind an operation: no global suppression — an ordinary save made meanwhile counts as unsent; the sync itself stays quiet', async () => {
  const x = await p.evaluate(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); GH.cfg = { ...GH.cfg, syncAt: new Date().toISOString() };
    const un = () => Number(localStorage.getItem('miz.unsent') || 0); const u0 = un(); let staged = false;
    const A = Store.batch('t:block', async B => { await save('people', 'p2', { note: 'عملیات' }, B); staged = true; await sleep(80); });
    while (!staged) await sleep(5); const t = new Date(Date.now() + 60000).toISOString();
    const SY = syncMerge({ people: [{ id: 'p3', name: 'شخص p3 از دستگاه دیگر', created: t, updated: t }] });
    await sleep(10); const flag = !!window._noUnsent; await save('people', 'p4', { note: 'عادی' }); const u1 = un();
    await Promise.all([A, SY]); return { flag, d1: u1 - u0, d2: un() - u1, p3: byId('people', 'p3').name }; });
  assert(!x.flag && x.d1 === 1, 'ordinary save while sync waits was not counted: ' + JSON.stringify(x));
  assert(x.p3 === 'شخص p3 از دستگاه دیگر' && x.d2 >= 1, 'sync / operation counters: ' + JSON.stringify(x));   // the operation's 1 write counts; the sync's are quiet
});

test('3 delDoc: failure at the tombstone → record, tombstone, trash, drafts and undo all unchanged; success updates them together', async () => {
  const st = () => p.evaluate(() => ({ trash: localStorage.getItem('miz.trash') || '', drafts: JSON.stringify(drGet()), undo: UB ? UB.ops.length : -1, tomb: !!(tombDoc().items || {})['people/p4'] }));
  await p.evaluate(() => { drSet([...drGet(), { id: 'dr1', op: { args: [{ id: 'p4' }] }, at: nowTs() }]); undoOpen(); });
  const s0 = await st();
  await fail('meta/tomb'); await same('delDoc failure', () => p.evaluate(() => delDoc('people', 'p4'))); await fail(null);
  const s1 = await st(); assert(JSON.stringify(s1) === JSON.stringify(s0), 'side state changed on failure: ' + JSON.stringify({ s0, s1 }));
  assert(await p.evaluate(() => delDoc('people', 'p4')), 'delete failed'); await settle(p);
  const s2 = await st(); assert(s2.tomb && s2.trash !== s0.trash && s2.drafts !== s0.drafts && s2.undo > s0.undo && !(await p.evaluate(() => byId('people', 'p4'))), 'success: ' + JSON.stringify(s2));
});

test('4 restoreApply0: a record changed by an operation that ran after the restore was asked for is judged on its new state (no stale overwrite)', async () => {
  const r = await p.evaluate(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const b = backupData(); window._rsJ = b;   // backup: p2 as it is now
    // the moment the restore makes its plan, another operation is requested that changes p2: if the plan was made before the restore's
    // own operation, that change runs first and the stale plan overwrites it; made inside the operation, the change runs after
    const real = window.restorePlan; let B1 = null;
    window.restorePlan = (...a) => { const P = real(...a); if (!B1) B1 = Store.batch('t:b1', async B => { await save('people', 'p2', { note: 'تازه‌تر از پشتیبان' }, B); }); return P; };
    await restoreApply0(false); await B1; window.restorePlan = real; return { note: byId('people', 'p2').note || '' }; });
  await settle(p); const d = JSON.parse(await disk()).find(x => x.startsWith('people/p2'));
  assert(r.note === 'تازه‌تر از پشتیبان' && d.includes('تازه‌تر از پشتیبان'), 'stale restore overwrote a newer record: ' + JSON.stringify({ r, d }));
});

test('5 undoDo: a failed undo keeps the undo (memory and database unchanged); tapping again succeeds', async () => {
  await p.evaluate(async () => { await save('people', null, { name: 'برای واگرد' }); const a = S.people.find(x => x.name === 'برای واگرد'); window._undo = [{ col: 'people', id: a.id, prev: null }]; window._uid = a.id; });
  await fail('any'); await same('undo failure', () => p.evaluate(() => undoDo())); await fail(null);
  assert(await p.evaluate(() => Array.isArray(window._undo) && window._undo.length === 1 && !window._undoBusy), 'undo state lost after failure');
  await p.evaluate(() => undoDo()); await settle(p);
  assert(await p.evaluate(() => !byId('people', window._uid) && window._undo === null), 'retry did not undo');
});

test('6 cloud mode: multi-record operations are refused with a clear message; nothing changes', async () => {
  const r = await p.evaluate(async () => { const m0 = JSON.stringify(S.people); mode = 'cloud';
    let res; try { res = await Promise.all([mergePeople('p1', 'p2'), postDoc({ id: 'dx', type: 'purchase', items: [] }, 'dx', 'payable', '', ''), applyData({}, false, 'x').then(() => 'ran', e => e.cloud ? 'refused' : e.message), Store.batch('k', async () => 1).then(() => 'ran', e => e.cloud ? 'refused' : 'other')]); }
    finally { mode = 'local'; }
    return { merge: res[0], post: !!(res[1] && res[1].failed), apply: res[2], batch: res[3], same: JSON.stringify(S.people) === m0, toast: document.getElementById('toast').textContent }; });
  assert(r.merge === 0 && r.post && r.apply === 'refused' && r.batch === 'refused' && r.same && /حالت ابری/.test(r.toast), 'cloud: ' + JSON.stringify(r));
  const v = await invariants(p); assert(!v.length, v.join('; ')); assert(!o.errors.length, o.errors.join(' | '));
});
test('6b cloud mode: deletion is refused before anything is recorded — no cloud call, no undo entry, trash, drafts or memory change', async () => {
  const r = await p.evaluate(async () => { const id = S.people[0].id; let calls = 0; const realDb = db; undoOpen();
    const before = { undo: UB.ops.length, trash: localStorage.getItem('miz.trash') || '', drafts: JSON.stringify(drGet()), n: S.people.length };
    mode = 'cloud'; db = { collection: () => ({ doc: () => ({ delete: async () => { calls++; throw new Error('synthetic cloud failure'); } }) }) };
    let res, raw; try { res = await delDoc('people', id); raw = await delRaw('people', id).then(() => 'ran', e => e.message); } finally { mode = 'local'; db = realDb; }
    return { res, raw, calls, same: UB.ops.length === before.undo && (localStorage.getItem('miz.trash') || '') === before.trash && JSON.stringify(drGet()) === before.drafts && S.people.length === before.n && !!byId('people', id),
      toast: document.getElementById('toast').textContent }; });
  assert(r.res === false && r.calls === 0 && r.same && /حالت ابری/.test(r.toast) && /حالت ابری/.test(r.raw), 'cloud delete: ' + JSON.stringify(r));
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
