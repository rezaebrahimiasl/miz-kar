// Store ownership (review of cd3c8a7): the held-record check runs in the transaction's own turn; ordinary writes and deletes of a
// record an operation has staged wait for it and are rebuilt from the real state; writes made by save() itself inside an operation
// (next occurrence of a repeating task, the reconciliation flag of lockAfter) belong to the operation; backups and snapshots
// requested during an operation contain only committed state; nested operations are refused; no lock is left behind. Synthetic.
const fs = require('fs'), path = require('path');
const { ROOT, serve, launch, openApp, settle, invariants, test, run, assert } = require('./lib');
let srv, o, p;
const disk = k => p.evaluate(k => new Promise(r => { const q = idb.transaction('docs').objectStore('docs').get(k); q.onsuccess = () => r(q.result ? q.result.doc : null); }), k);
const clean = () => p.evaluate(() => ({ act: Store._act, busy: Store._busy.size, rv: typeof _rvH !== 'undefined' ? _rvH : 0, inflight: Store._inflight.size }));
test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs(); for (const id of ['p_t', 'p_d', 'p_s']) await putRaw('people', { id, name: 'شخص ' + id, created: n, updated: n });
    await putRaw('tasks', { id: 't_r', title: 'کار تکراری', due: today(), repeat: 'daily', status: 'open', created: n, updated: n });
    await putRaw('ledger', { id: 'l_x', kind: 'paid', amount: 1e6, currency: 'تومان', acct: 'بانک الف', date: '2026-10-01', category: 'سایر', created: n, updated: n }); });
  await p.reload(); await settle(p); });

test('ordinary save requested BEFORE the operation stages the record (its turn comes after), operation fails → rebuilt from the real state; memory = disk; undo kept', async () => {
  const r = await p.evaluate(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let release; const gate = new Promise(r => release = r);
    Store._q = Store._q.then(() => gate);                                  // hold the write queue (test only)
    undoOpen(); const dv0 = window._dv || 0;
    const ord = save('people', 'p_t', { org: 'ثبت عادی' });              // requested now, its turn comes after the gate
    let staged = false;
    const op = Store.batch('t:1', async B => { await save('people', 'p_t', { note: 'تغییر عملیات' }, B); staged = true; await sleep(40); throw new Error('synthetic failure'); }).catch(e => 'failed');
    while (!staged) await sleep(5); release();
    const [ro, rop] = await Promise.all([ord, op]); const m = byId('people', 'p_t');
    return { ro, rop, org: m.org, note: m.note || '', undo: UB.ops.map(x => x.col + '/' + x.id), dv: (window._dv || 0) - dv0 }; });
  const d = await disk('people/p_t');
  assert(r.ro === true && r.rop === 'failed' && r.org === 'ثبت عادی' && r.note === '', 'memory: ' + JSON.stringify(r));
  assert(d.org === 'ثبت عادی' && !d.note, 'disk differs from memory / contains the failed operation: ' + JSON.stringify(d));
  assert(r.undo.includes('people/p_t') && r.dv === 1, 'undo/dirty: ' + JSON.stringify(r));
  await p.reload(); await settle(p); assert(await p.evaluate(() => byId('people', 'p_t').org === 'ثبت عادی' && !byId('people', 'p_t').note), 'after reload');
});

for (const fail of [true, false]) test(`delete of a record the operation staged waits for it (operation ${fail ? 'fails' : 'succeeds'}); memory = disk after reload`, async () => {
  const id = fail ? 'p_d' : 'p_s';
  const r = await p.evaluate(async ([id, fail]) => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let staged = false, opEnded = false;
    const op = Store.batch('t:del' + id, async B => { await save('people', id, { note: 'عملیات' }, B); staged = true; await sleep(40); if (fail) throw new Error('synthetic'); }).then(() => 'ok', () => 'failed').then(x => { opEnded = true; return x; });
    while (!staged) await sleep(5); const del = delDoc('people', id).then(x => ({ x, after: opEnded }));
    const [rop, rd] = await Promise.all([op, del]); return { rop, rd, mem: !!byId('people', id) }; }, [id, fail]);
  assert(r.rop === (fail ? 'failed' : 'ok') && r.rd.x === true && !r.mem, 'delete: ' + JSON.stringify(r));
  assert(!(await disk('people/' + id)), 'record still on disk');
  await p.reload(); await settle(p); assert(!(await p.evaluate(id => byId('people', id), id)), 'resurrected after reload');
});

test('repeating task completed inside a failing operation creates no next occurrence; the retry creates exactly one', async () => {
  const count = () => p.evaluate(() => S.tasks.filter(t => t.title === 'کار تکراری').length);
  const n0 = await count();
  const r1 = await p.evaluate(() => Store.batch('t:rep', async B => { await save('tasks', 't_r', { status: 'done', doneAt: nowTs() }, B); throw new Error('synthetic'); }).then(() => 'ok', () => 'failed'));
  await settle(p); const n1 = await count();
  assert(r1 === 'failed' && n1 === n0 && await p.evaluate(() => byId('tasks', 't_r').status === 'open'), 'failed op left a next occurrence: ' + JSON.stringify({ n0, n1 }));
  const r2 = await p.evaluate(() => Store.batch('t:rep', async B => { await save('tasks', 't_r', { status: 'done', doneAt: nowTs() }, B); }).then(() => 'ok', () => 'failed'));
  await settle(p); const n2 = await count();
  assert(r2 === 'ok' && n2 === n0 + 1, 'retry: ' + JSON.stringify({ n0, n2 }));
  await p.reload(); await settle(p); assert((await count()) === n0 + 1, 'after reload');
});

test('lockAfter metadata (reconciliation flag) rolls back with a failed operation', async () => {
  const r = await p.evaluate(async () => { const real = { lockMsg: window.lockMsg, lockOf: window.lockOf, askConfirm: window.askConfirm };
    window.lockMsg = () => 'قفل آزمون'; window.lockOf = () => ({ w: 'rec', n: 'بانک الف', d: '2026-10-15' }); window.askConfirm = async () => true;
    const before = JSON.stringify((S.meta.find(m => m.id === 'accts') || {}).a || null);
    const res = await Store.batch('t:lock', async B => { await save('ledger', 'l_x', { amount: 2e6 }, B); throw new Error('synthetic'); }).then(() => 'ok', () => 'failed');
    Object.assign(window, real); return { res, before, after: JSON.stringify((S.meta.find(m => m.id === 'accts') || {}).a || null), amount: byId('ledger', 'l_x').amount }; });
  const d = await disk('meta/accts');
  assert(r.res === 'failed' && r.after === r.before && r.amount === 1e6, 'memory: ' + JSON.stringify(r));
  assert(JSON.stringify((d && d.a) || null) === r.before, 'reconciliation flag written by a failed operation');
});

test('snapTake and the cloud backup requested during a failing operation contain only committed state', async () => {
  const r = await p.evaluate(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let staged = false, packed = null;
    const realPack = window.ghPack, cfg = GH.cfg; window.ghPack = async b => { packed = JSON.stringify(b.data.people.find(x => x.id === 'p_t')); throw new Error('stop test'); };
    GH.cfg = { ...cfg, token: 'synthetic', repo: 'synthetic/repo', pass: 'synthetic-pass', sync: false };
    const op = Store.batch('t:snap', async B => { await save('people', 'p_t', { note: 'نباید در نسخه باشد' }, B); staged = true; await sleep(60); throw new Error('synthetic'); }).catch(() => 'failed');
    while (!staged) await sleep(5);
    const sp = snapTake('manual'); const gp = ghPush0(true).catch(() => {});
    const [ro, sid] = await Promise.all([op, sp, gp]); window.ghPack = realPack; GH.cfg = cfg;
    const s = sid && await snapGet(sid); const j = s && JSON.parse(s.txt); const sn = j && j.data.people.find(x => x.id === 'p_t');
    return { ro, sid: !!sid, snapNote: sn ? sn.note || '' : 'missing', packed }; });
  assert(r.ro === 'failed' && r.sid && r.snapNote === '', 'snapshot captured uncommitted state: ' + JSON.stringify(r));
  assert(r.packed && !r.packed.includes('نباید در نسخه باشد'), 'cloud backup captured uncommitted state: ' + JSON.stringify(r));
});

test('nested operations are refused with a clear error; operation bodies never start another operation; no lock or hold left behind', async () => {
  const e = await p.evaluate(() => Store.batch('t:nest', async B => { B.batch('x', async () => {}); }).then(() => 'no error', x => x.message));
  assert(/nested operation/.test(e), 'nested: ' + e);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const mk of ['mkPostDoc0', 'mkDocVoid0', 'mkMergePeople0', 'mkPersonByName', 'mkOpenFlow', 'mkCloseFlows']) {
    const i = html.indexOf('const ' + mk + '='); assert(i > 0, mk + ' missing'); const body = html.slice(i, html.indexOf('\n', html.indexOf('};', i)));
    assert(!/(?<![\w.])(postDoc|docVoid|mergePeople)\(|Store\.batch\(/.test(body.replace(/^const \w+=/, '')), mk + ' starts another operation'); }
  await settle(p); const c = await clean(); assert(c.act === null && c.busy === 0 && c.rv === 0 && c.inflight === 0, 'leaked state: ' + JSON.stringify(c));
  const v = await invariants(p); assert(!v.length, v.join('; ')); assert(!o.errors.length, o.errors.join(' | '));
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
