// Stage 2: every delete goes through delRaw (Store.tx or the operation's Store.stageDel); restore (applyData, restoreApply0),
// sync (syncMerge), conflict resolution (confPick) and undo (undoDo) are atomic operations. Failures midway leave memory and
// database unchanged; a sync deletion and an ordinary save of the same record never leave a half record; undo of a new record waits
// for an operation that holds it; deletion vs update; reload; unsent counter and tombstones. Synthetic data only.
const fs = require('fs'), path = require('path');
const { ROOT, serve, launch, openApp, settle, invariants, test, run, assert } = require('./lib');
let srv, o, p;
const mem = () => p.evaluate(() => JSON.stringify(COLS.filter(c => c !== 'contacts').map(c => (S[c] || []).map(x => JSON.stringify(x)).sort())));
const disk = () => p.evaluate(() => new Promise(r => { const q = idb.transaction('docs').objectStore('docs').getAll(); q.onsuccess = () => r(JSON.stringify(q.result.filter(x => x.col !== 'contacts').map(x => x.k + JSON.stringify(x.doc)).sort())); }));
const one = k => p.evaluate(k => new Promise(r => { const q = idb.transaction('docs').objectStore('docs').get(k); q.onsuccess = () => r(q.result ? q.result.doc : null); }), k);
const stageFail = n => p.evaluate(n => { if (!window._st) window._st = Store.stage; if (!window._sd) window._sd = Store.stageDel; let c = 0;
  const hit = () => { if (n && ++c === n) throw new Error('synthetic failure at write ' + n); };
  Store.stage = n ? function (...a) { hit(); return window._st.apply(this, a); } : window._st; Store.stageDel = n ? function (...a) { hit(); return window._sd.apply(this, a); } : window._sd; }, n);
async function same(what, fn) { const m0 = await mem(), d0 = await disk(); await fn(); await settle(p); assert((await mem()) === m0, what + ': memory changed'); assert((await disk()) === d0, what + ': database changed'); }
test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page; await p.evaluate(() => setSM('undo', true));
  await p.evaluate(async () => { const n = nowTs(); for (let i = 1; i <= 5; i++) await putRaw('people', { id: 'p' + i, name: 'شخص ' + i, created: n, updated: n });
    await putRaw('ledger', { id: 'l1', kind: 'receivable', personId: 'p1', amount: 2e6, currency: 'تومان', date: '2026-10-01', instrument: 'نسیه', created: n, updated: n }); });
  await p.reload(); await settle(p); });

test('restore (applyData, replace all): a failure at the 1st/3rd/last write or delete changes nothing; success applies everything at once', async () => {
  const data = await p.evaluate(() => { const b = backupData().data; return { ...b, people: [...b.people.filter(x => x.id !== 'p5').map(x => x.id === 'p1' ? { ...x, note: 'از پشتیبان' } : x), { id: 'p9', name: 'شخص پشتیبان', created: nowTs(), updated: nowTs() }] }; });
  for (const n of [1, 3, 4]) { await stageFail(n); await same('applyData failure at ' + n, () => p.evaluate(d => applyData(d, true, 'restore').catch(() => {}), data)); await stageFail(0); }
  const n = await p.evaluate(d => applyData(d, true, 'restore'), data); await settle(p);
  const r = await p.evaluate(() => ({ p1: byId('people', 'p1').note, p5: !!byId('people', 'p5'), p9: !!byId('people', 'p9'), tomb: !!(tombDoc().items || {})['people/p5'] }));
  assert(n >= 3 && r.p1 === 'از پشتیبان' && !r.p5 && r.p9 && r.tomb, 'apply: ' + JSON.stringify({ n, r }));
  await p.reload(); await settle(p); assert(await p.evaluate(() => !byId('people', 'p5') && !!byId('people', 'p9') && byId('people', 'p1').note === 'از پشتیبان'), 'after reload');
});

test('restore preview (restoreApply0): failure midway → «چیزی تغییر نکرد», memory and database unchanged', async () => {
  await p.evaluate(() => { const b = backupData(); b.data.people = [...b.data.people, { id: 'p10', name: 'ده', created: nowTs(), updated: nowTs() }, { id: 'p11', name: 'یازده', created: nowTs(), updated: nowTs() }]; window._rsJ = b; window.askConfirm = async () => true; });
  await stageFail(2); await same('restoreApply0 failure', () => p.evaluate(() => restoreApply0(false))); await stageFail(0);
  await p.evaluate(() => restoreApply0(false)); await settle(p); assert(await p.evaluate(() => !!byId('people', 'p10') && !!byId('people', 'p11')), 'restore did not apply');
});

test('sync: a failure midway changes nothing (no unsent change counted); success applies records, deletions and tombstones at once', async () => {
  const remote = await p.evaluate(() => { const t = new Date(Date.now() + 60000).toISOString(); return { people: [{ id: 'p2', name: 'شخص ۲ از دستگاه دیگر', created: t, updated: t }, { id: 'p20', name: 'تازه از دستگاه دیگر', created: t, updated: t }], meta: [{ id: 'tomb', items: { 'people/p3': t } }] }; });
  // a device that has synced before (records here are older than its last sync): normal merge rules, no first-sync conflicts
  await p.evaluate(() => { GH.cfg = { ...GH.cfg, syncAt: new Date().toISOString() }; });
  const un0 = await p.evaluate(() => localStorage.getItem('miz.unsent'));
  await stageFail(2); await same('sync failure', () => p.evaluate(d => syncMerge(d).catch(() => {}), remote)); await stageFail(0);
  const n = await p.evaluate(d => syncMerge(d), remote); await settle(p);
  const r = await p.evaluate(() => ({ p2: byId('people', 'p2').name, p20: !!byId('people', 'p20'), p3: !!byId('people', 'p3'), un: localStorage.getItem('miz.unsent') }));
  assert(n >= 3 && r.p2 === 'شخص ۲ از دستگاه دیگر' && r.p20 && !r.p3 && r.un === un0, 'sync: ' + JSON.stringify({ n, r, un0 }));
  assert(!(await one('people/p3')), 'deleted record still on disk');
});

test('sync deletion while an ordinary save of the same record is requested: the save waits and is refused (no half record); memory = disk', async () => {
  const r = await p.evaluate(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const t = new Date(Date.now() + 120000).toISOString(); let release;
    const realDel = window.delRaw; let staged = false; window.delRaw = async (...a) => { const x = await realDel(...a); staged = true; await new Promise(r => release = r); return x; };
    const sy = syncMerge({ people: [], meta: [{ id: 'tomb', items: { 'people/p4': t } }] });
    while (!staged) await sleep(5); const sv = save('people', 'p4', { note: 'ویرایش هم‌زمان' }); await sleep(20); release(); const [rs, rv] = await Promise.all([sy, sv]); window.delRaw = realDel;
    return { rs, rv, mem: byId('people', 'p4') || null }; });
  assert(r.rs >= 1 && r.rv === false && !r.mem, 'concurrent save vs sync delete: ' + JSON.stringify(r));
  assert(!(await one('people/p4')), 'stub record on disk');
  await p.reload(); await settle(p); assert(!(await p.evaluate(() => byId('people', 'p4'))), 'resurrected after reload');
});

test('ordinary delete and update of one record at the same time: no stub, memory = disk', async () => {
  // whichever comes first in the queue, the end state is the deleted record: an update before it is overwritten by the delete, an update after it is refused (no stub)
  const r = await p.evaluate(async () => { const [a, b] = await Promise.all([delDoc('people', 'p1'), save('people', 'p1', { note: 'هم‌زمان' })]); return { a, b, mem: !!byId('people', 'p1') }; });
  assert(r.a === true && !r.mem && !(await one('people/p1')), 'delete vs update: ' + JSON.stringify(r));

});

test('undo of a new record during an operation that holds it waits for the operation; undo is atomic; tombstone written', async () => {
  const r = await p.evaluate(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms));
    // the undo list of an action that created this record (as undoShow resolves it: the new record's id, no previous version)
    await save('people', null, { name: 'تازهٔ واگرد' }); const id = S.people.find(x => x.name === 'تازهٔ واگرد').id; window._undo = [{ col: 'people', id, prev: null }];
    let staged = false; const op = Store.batch('t:hold', async B => { await save('people', id, { note: 'در عملیات' }, B); staged = true; await sleep(50); });
    while (!staged) await sleep(5); let opDone = false; op.then(() => opDone = true); await undoDo(); const after = opDone; await op;
    return { id, gone: !byId('people', id), after, tomb: !!(tombDoc().items || {})['people/' + id] }; });
  assert(r.gone && r.after && r.tomb, 'undo during operation: ' + JSON.stringify(r));
  assert(!(await one('people/' + r.id)), 'undone record still on disk');
});

test('undo failure midway restores everything; no direct IndexedDB delete left in the code; invariants; no leaked state', async () => {
  // an undo with a restore (deleted record comes back) and a delete (new record goes): all or nothing
  await p.evaluate(async () => { await save('people', null, { name: 'واگرد الف' }); const a = S.people.find(x => x.name === 'واگرد الف'); const b = byId('people', 'p5') || byId('people', 'p9');
    const prev = JSON.parse(JSON.stringify(b)); await delDoc('people', b.id); window._undo = [{ col: 'people', id: b.id, prev }, { col: 'people', id: a.id, prev: null }]; window._undoFix = { a: a.id, b: b.id }; });
  await stageFail(2); await same('undo failure', () => p.evaluate(() => { const u = window._undo; return undoDo().then(() => { window._undo = u; }); })); await stageFail(0);
  await p.evaluate(() => undoDo()); await settle(p);
  const u = await p.evaluate(() => ({ a: !!byId('people', window._undoFix.a), b: !!byId('people', window._undoFix.b), tomb: !!(tombDoc().items || {})['people/' + window._undoFix.b] }));
  assert(!u.a && u.b && !u.tomb, 'undo: ' + JSON.stringify(u));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') + fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
  assert(!/(?<![\w.])idbDel\(|(?<![\w.])idbPut\(|objectStore\('docs'\)\.(delete|clear)\(/.test(html), 'a direct IndexedDB write/delete remains');
  const c = await p.evaluate(() => ({ act: Store._act, busy: Store._busy.size, inflight: Store._inflight.size })); assert(c.act === null && !c.busy && !c.inflight, 'leaked: ' + JSON.stringify(c));
  const v = await invariants(p); assert(!v.length, v.join('; ')); assert(!o.errors.length, o.errors.join(' | '));
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
