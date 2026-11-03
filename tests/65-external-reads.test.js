// External outputs read committed state at the moment they read, not only at their start (review of fb62f06): Store.read waits for
// an active operation; snapTake, the encrypted second copy (bk2), the cloud backup (ghPush0) and sync (ghSync) and the Google
// Calendar plan (gcSync) read through it; a change made during an upload keeps the «unsent» state; a failed conflict choice shows
// the restored list. Synthetic data only; no network (GitHub calls are stubbed in the page).
const fs = require('fs'), path = require('path');
const { ROOT, serve, launch, openApp, settle, test, run, assert } = require('./lib');
let srv, o, p;
test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs(); await putRaw('people', { id: 'p_e', name: 'شخص خروجی', created: n, updated: n }); }); await p.reload(); await settle(p); });

// an operation that stages p_e and fails, started while the reader is already running
const op = () => `const sleep = ms => new Promise(r => setTimeout(r, ms)); let staged = false;
  const startOp = () => Store.batch('t:' + Math.random(), async B => { await save('people', 'p_e', { note: 'تغییرِ ثبت‌نشده' }, B); staged = true; await sleep(60); throw new Error('synthetic'); }).catch(() => 'failed');`;

test('Store.read waits for an active operation and runs when none is active', async () => {
  const r = await p.evaluate(`(async () => { ${op()} const A = startOp(); while (!staged) await sleep(5);
    const v = await Store.read(() => ({ act: Store._act, note: byId('people', 'p_e').note || '' })); await A; return v; })()`);
  assert(r.act === null && r.note === '', 'read during operation: ' + JSON.stringify(r));
});

test('snapTake: an operation that starts after snapTake began (while it lists copies) is not in the copy', async () => {
  const r = await p.evaluate(`(async () => { ${op()} const real = window.snapList; let A;
    window.snapList = async (...a) => { const x = await real(...a); A = startOp(); while (!staged) await sleep(5); return x; };
    const id = await snapTake('manual'); window.snapList = real; await A; const s = await snapGet(id); const j = JSON.parse(s.txt);
    return { note: (j.data.people.find(x => x.id === 'p_e') || {}).note || '' }; })()`);
  assert(r.note === '', 'snapshot holds uncommitted state: ' + JSON.stringify(r));
});

test('bk2: the operation starts while the confirmation dialog is open; the second copy holds committed state only', async () => {
  const r = await p.evaluate(`(async () => { ${op()} const ra = window.askConfirm, rp = window.ghPack, rs = window.shareFile, cfg = GH.cfg; let packed = null, A;
    GH.cfg = { ...cfg, pass: '' }; window.askConfirm = async () => { A = startOp(); while (!staged) await sleep(5); return true; };
    window.ghPack = async b => { packed = (b.data.people.find(x => x.id === 'p_e') || {}).note || ''; return 'x'; }; window.shareFile = async () => true;
    await bk2(); Object.assign(window, { askConfirm: ra, ghPack: rp, shareFile: rs }); GH.cfg = cfg; await A; return { packed }; })()`);
  assert(r.packed === '', 'second copy holds uncommitted state: ' + JSON.stringify(r));
});

test('cloud backup (ghPush0): a change made during the upload keeps «unsent» (not cleared); without one it is cleared', async () => {
  const run = during => p.evaluate(`(async () => { const cfg = GH.cfg, rapi = window.ghApi, rp = window.ghPack;
    GH.cfg = { ...cfg, token: 'synthetic', repo: 'synthetic/r', pass: 'synthetic-pass', sync: false, cal: '' }; window.ghPack = async () => 'x';
    window.ghApi = async (pth, opt) => { if (opt && opt.method === 'PUT') { if (${during}) await save('people', 'p_e', { org: 'حین ارسال' }); return { ok: true, status: 201, json: async () => ({}) }; } return { status: 200, json: async () => ({ sha: 's' }) }; };
    await save('people', 'p_e', { email: 'x' + Date.now() + '@t.test' }); await ghPush0(false);
    const r = { unsent: Number(localStorage.getItem('miz.unsent') || 0), dirty: ghDirty, err: GH.cfg.err || '' }; window.ghApi = rapi; window.ghPack = rp; GH.cfg = cfg; return r; })()`);
  const a = await run(true); assert(a.unsent > 0 && a.dirty === true && !a.err, 'change during upload was marked as sent: ' + JSON.stringify(a));
  const b = await run(false); assert(b.unsent === 0 && b.dirty === false && !b.err, 'normal upload did not clear: ' + JSON.stringify(b));
});

test('ghSync, gcSync and ghPush0 read through Store.read at the read itself (static check)', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(/Store\.read\(\(\)=>\{dvS=window\._dv\|\|0;return syncData\(\)\}\)/.test(html), 'ghSync does not read through Store.read');
  assert(/P=await Store\.read\(\(\)=>gcPlan\(\)\)/.test(html), 'gcSync plan not read through Store.read');
  assert(/ghPack\(await Store\.read\(\(\)=>\{dvS=window\._dv\|\|0;return backupData\(\)\}\)/.test(html), 'ghPush0 does not read through Store.read');
});

test('a failed conflict choice shows the restored conflict list; no leaked state; no page errors', async () => {
  const r = await p.evaluate(async () => { const t = nowTs(); await putRaw('meta', { id: 'conflicts', list: [{ key: 'people/p_e', col: 'people', id: 'p_e', local: byId('people', 'p_e'), remote: { ...byId('people', 'p_e'), name: 'دور' }, at: t, open: true }], created: t, updated: t });
    const st = Store.stage; Store.stage = function () { throw new Error('synthetic'); }; let shown = 0; const rc = window.conflictsSheet; window.conflictsSheet = () => { shown++; };
    await confPick('people/p_e', 'remote'); Store.stage = st; window.conflictsSheet = rc;
    return { shown, open: CONF().filter(x => x.open).length, name: byId('people', 'p_e').name, act: Store._act, busy: Store._busy.size }; });
  assert(r.shown >= 1 && r.open === 1 && r.name === 'شخص خروجی' && r.act === null && !r.busy, 'conflict failure: ' + JSON.stringify(r));
  assert(!o.errors.length, o.errors.join(' | '));
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
