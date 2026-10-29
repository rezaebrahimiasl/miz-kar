// Round 2: syncMerge — how a device merges the copy another device left on GitHub. Called directly with synthetic
// payloads shaped like syncData(); fixed timestamps around a «last sync» moment. Covers conflicting edits, deletions
// (tombstones both ways), records missing on one side, duplicate records, and data the merge must leave alone
// (device-only records, unrelated records, the unsent counter, the accounting invariants). Synthetic data only.
const { serve, launch, openApp, ready, invariants, test, run, assert } = require('./lib');
let srv, o, p;
const LAST = '2026-10-01T10:00:00.000Z';                       // this device's last successful sync
const OLD = '2026-10-01T09:00:00.000Z', A = '2026-10-01T11:00:00.000Z', B = '2026-10-01T12:00:00.000Z', C = '2026-10-01T13:00:00.000Z';
const inv = async what => { const v = await invariants(p); assert(!v.length, `${what}: invariants broken: ${v.join('; ')}`); };
const task = (id, title, updated, extra = {}) => ({ id, title, status: 'open', priority: 3, due: '2026-10-05', created: OLD, updated, ...extra });
const person = (id, name, updated, extra = {}) => ({ id, name, created: OLD, updated, ...extra });

// local: records to put on this device first; tombs: this device's tombstones; remote: the other device's data
const merge = (local, remote, { tombs, last = LAST } = {}) => p.evaluate(async ([local, remote, tombs, last]) => {
  for (const [c, d] of local) await putRaw(c, d);
  if (tombs) { const t = tombDoc(); await putRaw('meta', { ...t, items: { ...(t.items || {}), ...tombs }, updated: last, created: t.created || last }); }
  GH.cfg = { ...GH.cfg, syncAt: last }; lsSet('miz.unsent', 0);
  const n = await syncMerge(remote);
  return { n, unsent: unsentN(), flag: !!window._noUnsent };
}, [local, remote, tombs || null, last]);
const get = (c, id) => p.evaluate(([c, id]) => { const x = S[c].filter(d => d.id === id); return x.length > 1 ? { dup: x.length } : (x[0] ? JSON.parse(JSON.stringify(x[0])) : null); }, [c, id]);
const conf = key => p.evaluate(key => JSON.parse(JSON.stringify(openConf().filter(x => x.key === key))), key);
const idbHas = (c, id) => p.evaluate(([c, id]) => new Promise(res => { const r = idb.transaction('docs').objectStore('docs').get(c + '/' + id); r.onsuccess = () => res(r.result || null); r.onerror = () => res('err'); }), [c, id]);

test('setup: synthetic people, tasks, a bank account and one expense', async () => {
  srv = await serve(); o = await launch(); p = o.page; await openApp(o, srv.url);
  await p.evaluate(async ([OLD]) => { const b = { created: OLD, updated: OLD };
    await putRaw('people', { id: 'u1', name: 'شخص بی‌ربط آزمون', ...b });
    await putRaw('meta', { id: 'accts', a: { 'بانک الف': { open: 50e6, openDate: '2026-09-01' } }, ...b });
    await putRaw('ledger', { id: 'ux1', kind: 'paid', amount: 2e6, currency: 'تومان', acct: 'بانک الف', about: 'اجارهٔ آزمون', category: 'اجاره', instrument: 'نقد/کارت', date: '2026-09-20', settled: false, void: false, ...b });
    render(); }, [OLD]);
  await inv('fixtures');
});

test('conflicting edits: only one side changed since the last sync → the newer copy wins, no conflict', async () => {
  // remote newer, local untouched since LAST
  let r = await merge([['tasks', task('t1', 'نسخهٔ قدیم', OLD)]], { tasks: [task('t1', 'نسخهٔ دستگاه دیگر', A)] });
  let t = await get('tasks', 't1');
  assert(r.n === 1 && t.title === 'نسخهٔ دستگاه دیگر' && t.updated === A && !(await conf('tasks/t1')).length, 'remote newer: ' + JSON.stringify({ r, t }));
  // local newer, remote untouched since LAST
  r = await merge([['tasks', task('t2', 'ویرایش این دستگاه', A)]], { tasks: [task('t2', 'نسخهٔ قدیم', OLD)] });
  t = await get('tasks', 't2');
  assert(r.n === 0 && t.title === 'ویرایش این دستگاه' && !(await conf('tasks/t2')).length, 'local newer: ' + JSON.stringify({ r, t }));
});

test('conflicting edits: both sides changed since the last sync → local kept, a conflict holds both copies', async () => {
  for (const [id, lu, ru] of [['t3', A, B], ['t4', B, A], ['t5', A, A]]) {      // remote newer · local newer · same moment
    const r = await merge([['tasks', task(id, 'محلی ' + id, lu)]], { tasks: [task(id, 'دور ' + id, ru)] });
    const t = await get('tasks', id), c = await conf('tasks/' + id);
    assert(t.title === 'محلی ' + id && c.length === 1 && c[0].local.title === 'محلی ' + id && c[0].remote.title === 'دور ' + id && c[0].col === 'tasks',
      `${id}: ` + JSON.stringify({ r, t, c }));
    assert(r.unsent === 0 && !r.flag, `${id}: merging counted as unsent local changes (${r.unsent}) or left the flag on`);
  }
  // a conflict and a deletion arriving together: the merge still does not count as unsent local changes
  const r2 = await merge([['tasks', task('t8', 'محلی t8', A)], ['people', person('d0', 'حذف دور', OLD)]], { tasks: [task('t8', 'دور t8', B)], meta: [{ id: 'tomb', items: { 'people/d0': A } }] });
  assert((await conf('tasks/t8')).length === 1 && !(await get('people', 'd0')) && r2.unsent === 0 && !r2.flag, 'conflict + deletion: ' + JSON.stringify(r2));
  // both changed to the same content → nothing to resolve
  await merge([['tasks', task('t6', 'یکسان', A)]], { tasks: [task('t6', 'یکسان', A)] });
  assert(!(await conf('tasks/t6')).length, 'identical copies became a conflict');
  // while a conflict is open, newer remote copies of that record wait for the user's choice
  const r = await merge([], { tasks: [task('t3', 'دور t3 باز هم', C)] });
  assert(r.n === 0 && (await get('tasks', 't3')).title === 'محلی t3', 'open conflict was overwritten');
});

test('conflicting edits: first sync on a device (no «last sync») → newer copy wins, no conflict (current policy)', async () => {
  const r = await merge([['tasks', task('t7', 'محلی', A)]], { tasks: [task('t7', 'دور', B)] }, { last: '' });
  assert(r.n === 1 && (await get('tasks', 't7')).title === 'دور' && !(await conf('tasks/t7')).length, JSON.stringify(r));
});

test('deletions: tombstones from either side, against older and newer copies', async () => {
  // the other device deleted d1 after this device's copy was last changed → deleted here, also from storage
  let r = await merge([['people', person('d1', 'حذف در دستگاه دیگر', OLD)]], { people: [], meta: [{ id: 'tomb', items: { 'people/d1': A } }] });
  assert(r.n >= 1 && !(await get('people', 'd1')) && !(await idbHas('people', 'd1')), 'remote delete not applied: ' + JSON.stringify(r));
  // this device deleted d2; the other device still has its older copy → it does not come back
  r = await merge([], { people: [person('d2', 'حذف‌شده اینجا', OLD)] }, { tombs: { 'people/d2': A } });
  assert(!(await get('people', 'd2')), 'deleted record came back from an older remote copy');
  // the other device edited d3 after this device deleted it → the newer edit comes back
  r = await merge([], { people: [person('d3', 'ویرایش بعد از حذف', B)] }, { tombs: { 'people/d3': A } });
  assert((await get('people', 'd3') || {}).name === 'ویرایش بعد از حذف', 'newer remote edit lost to an older deletion');
  // this device edited d4 after the other device deleted it → kept
  r = await merge([['people', person('d4', 'ویرایش اینجا بعد از حذف', B)]], { people: [], meta: [{ id: 'tomb', items: { 'people/d4': A } }] });
  assert((await get('people', 'd4') || {}).name === 'ویرایش اینجا بعد از حذف', 'newer local edit lost to an older remote deletion');
  // tombstones from both sides are kept (latest time wins) so the next push carries them all
  const T = await p.evaluate(() => tombDoc().items);
  assert(T['people/d1'] === A && T['people/d2'] === A && T['people/d3'] === A, 'tombstones not merged: ' + JSON.stringify(T));
  await merge([], { meta: [{ id: 'tomb', items: { 'people/d2': OLD } }] });
  assert((await p.evaluate(() => tombDoc().items['people/d2'])) === A, 'an older remote tombstone replaced a newer local one');
});

test('missing records: what only one side has is kept (no deletion without a tombstone); new remote records arrive verbatim', async () => {
  await p.evaluate(async ([OLD]) => { await putRaw('tasks', { id: 'm1', title: 'فقط اینجا', status: 'open', created: OLD, updated: OLD }); }, [OLD]);
  const before = await get('tasks', 'm1');
  const rp = person('m2', 'فقط آنجا', A, { phone: '09000000000', tags: ['آزمون'] });
  const r = await merge([], { tasks: [], people: [rp] });                      // remote lacks m1 entirely
  assert(JSON.stringify(await get('tasks', 'm1')) === JSON.stringify(before), 'local-only record changed or removed');
  assert(r.n === 1 && JSON.stringify(await get('people', 'm2')) === JSON.stringify(rp) && await idbHas('people', 'm2'), 'remote-only record: ' + JSON.stringify(await get('people', 'm2')));
  // a payload without a collection at all, or with empty or id-less entries, changes nothing
  const r2 = await merge([], { people: [null, {}, { name: 'بی‌شناسه' }] });
  assert(r2.n === 0 && !(await p.evaluate(() => S.people.some(x => !x.id))), 'id-less entries were stored');
});

test('duplicate records: the same id twice in the payload, or already identical here → one copy, the newest', async () => {
  let r = await merge([], { tasks: [task('k1', 'اول', A), task('k1', 'دوم', B)] });
  assert((await get('tasks', 'k1')).title === 'دوم', 'older-then-newer: ' + JSON.stringify(await get('tasks', 'k1')));
  r = await merge([], { tasks: [task('k2', 'جدیدتر', B), task('k2', 'قدیمی‌تر', OLD)] });
  assert((await get('tasks', 'k2')).title === 'جدیدتر', 'newer-then-older: ' + JSON.stringify(await get('tasks', 'k2')));
  const ids = await p.evaluate(() => S.tasks.map(x => x.id)); assert(new Set(ids).size === ids.length, 'duplicate ids in memory');
  // merging the same payload again (as after a retried push) changes nothing
  const pay = { tasks: [task('k3', 'یک‌بار', A)], people: [person('k4', 'یک‌بار', A)] };
  r = await merge([], pay); const again = await merge([], pay);
  assert(r.n === 2 && again.n === 0 && !(await conf('tasks/k3')).length, 'not idempotent: ' + JSON.stringify([r, again]));
});

test('unrelated data: device-only fingerprint record, conflicts list and records outside the payload stay as they were', async () => {
  const bio = { id: 'bio', cred: 'SYNTHETIC', salt: 'S', iv: 'I', ct: 'C', created: OLD, updated: OLD };
  await p.evaluate(async bio => { await putRaw('vault', bio); }, bio);
  const keep = await p.evaluate(() => JSON.stringify(['people', 'ledger', 'meta'].map(c => S[c].filter(x => ['u1', 'ux1', 'accts'].includes(x.id)))));
  const confBefore = await p.evaluate(() => JSON.stringify(CONF()));
  // the other device switched its fingerprint unlock off (that deletes its own «vault/bio») and sends its own lists
  const r = await merge([], { vault: [{ ...bio, cred: 'OTHER', updated: C }], meta: [{ id: 'tomb', items: { 'vault/bio': C } }, { id: 'conflicts', list: [{ key: 'x/y', open: true }] }] });
  assert(JSON.stringify(await get('vault', 'bio')) === JSON.stringify(bio) && await idbHas('vault', 'bio'), "this device's fingerprint record was changed or deleted by another device: " + JSON.stringify(await get('vault', 'bio')));
  assert((await p.evaluate(() => JSON.stringify(CONF()))) === confBefore, "the other device's conflicts list replaced this one");
  assert((await p.evaluate(() => JSON.stringify(['people', 'ledger', 'meta'].map(c => S[c].filter(x => ['u1', 'ux1', 'accts'].includes(x.id)))))) === keep, 'unrelated records changed');
  assert(r.unsent === 0 && !r.flag, 'unsent counter/flag: ' + JSON.stringify(r));
  await inv('after the merges');
});

test('everything merged is in storage: a reload shows the same records (deletions included)', async () => {
  const want = await p.evaluate(() => JSON.stringify(['tasks', 'people', 'vault'].map(c => S[c].map(x => x.id + '@' + x.updated).sort())));
  await p.reload(); await ready(p);
  const got = await p.evaluate(() => JSON.stringify(['tasks', 'people', 'vault'].map(c => S[c].map(x => x.id + '@' + x.updated).sort())));
  assert(got === want, 'after reload: ' + got + ' ≠ ' + want);
  await inv('after reload');
});

test('no page errors', async () => { assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
