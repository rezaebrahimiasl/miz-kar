// Atomic business operations (Store.batch): mergePeople, docVoid and postDoc write all their records in one transaction or none.
// A failure — at commit (simulated quota error) or in the middle of the operation (at the 1st, 2nd, 3rd and the last staged write) — leaves
// memory AND the database exactly as before; a repeat or a concurrent second call does not duplicate anything; invariants hold.
// Synthetic data only.
const { serve, launch, openApp, settle, seedSmall, openDoc, submit, invariants, test, run, assert } = require('./lib');
let srv, o, p, lot;
const mem = () => p.evaluate(() => JSON.stringify(COLS.filter(c => c !== 'contacts').map(c => (S[c] || []).map(x => JSON.stringify(x)).sort())));
const disk = () => p.evaluate(() => new Promise(r => { const q = idb.transaction('docs').objectStore('docs').getAll(); q.onsuccess = () => r(JSON.stringify(q.result.filter(x => x.col !== 'contacts' && x.col !== 'meta').map(x => x.k + JSON.stringify(x.doc)).sort())); }));
const quota = on => p.evaluate(on => { const P = IDBObjectStore.prototype; if (!window._op) window._op = P.put; P.put = on ? function () { throw new DOMException('synthetic quota', 'QuotaExceededError'); } : window._op; }, on);
// fail inside the operation at the n-th staged record (before anything is committed)
const stageFail = n => p.evaluate(n => { if (!window._st) window._st = Store.stage; let c = 0; Store.stage = n ? function (...a) { if (++c === n) throw new Error('synthetic failure at write ' + n); return window._st.apply(this, a); } : window._st; }, n);
async function same(what, fn) { const m0 = await mem(), d0 = await disk(); const r = await fn(); await settle(p); const m1 = await mem(), d1 = await disk();
  assert(m1 === m0, what + ': memory changed'); assert(d1 === d0, what + ': database changed'); return r; }
const inv = async what => { const v = await invariants(p); assert(!v.length, what + ': ' + v.join('; ')); };

test('setup: purchase 100 kg, a sale of 10, a duplicate person with references', async () => {
  srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page; lot = await seedSmall(p); await settle(p);
  await openDoc(p, { type: 'invoice', personId: 'p_a', date: '2026-10-02', led: 'receivable', items: [{ desc: 'عسل آزمون', qty: 10, unit: 'کیلو', price: 1e6, src: 'lot', lotId: lot }] }); await submit(p); await settle(p);
  await p.evaluate(async () => { const n = nowTs(); await putRaw('people', { id: 'p_dup', name: 'خریدار تکراری', created: n, updated: n });
    await putRaw('ledger', { id: 'l_dup', kind: 'receivable', personId: 'p_dup', amount: 3e6, currency: 'تومان', date: '2026-10-03', instrument: 'نسیه', created: n, updated: n });
    await putRaw('quotes', { id: 'q_dup', dir: 'gave', personId: 'p_dup', product: 'عسل آزمون', price: 1e6, unit: 'کیلو', currency: 'تومان', date: '2026-10-03', created: n, updated: n });
    await putRaw('tasks', { id: 't_dup', title: 'تماس', personId: 'p_dup', status: 'open', due: today(), created: n, updated: n }); });
  await p.reload(); await settle(p); await inv('fixtures');
});

test('mergePeople: a failure at commit or mid-operation changes nothing; success moves every reference; a repeat is a no-op', async () => {
  await quota(true); const r1 = await same('merge, quota at commit', () => p.evaluate(() => mergePeople('p_a', 'p_dup'))); await quota(false);
  for (const n of [1, 3]) { await stageFail(n); await same('merge, failure at write ' + n, () => p.evaluate(() => mergePeople('p_a', 'p_dup'))); await stageFail(0); }
  assert(r1 === 0, 'failed merge reported success');
  const bal0 = await p.evaluate(() => ((personBal()['p_a'] || {})['تومان'] || 0) + ((personBal()['p_dup'] || {})['تومان'] || 0));
  const n = await p.evaluate(() => mergePeople('p_a', 'p_dup')); await settle(p);
  const r = await p.evaluate(() => ({ refs: ['ledger', 'quotes', 'tasks'].map(c => S[c].filter(x => x.personId === 'p_dup').length), moved: byId('ledger', 'l_dup').personId, src: byId('people', 'p_dup'), bal: (personBal()['p_a'] || {})['تومان'] || 0 }));
  assert(n > 0 && r.refs.every(x => x === 0) && r.moved === 'p_a' && r.src.mergedInto === 'p_a' && r.src.status === 'archived' && Math.abs(r.bal - bal0) < 1, 'merge: ' + JSON.stringify({ n, r, bal0 }));
  const again = await same('merge repeated', () => p.evaluate(() => mergePeople('p_a', 'p_dup'))); assert(again === 0, 'repeat merge did something');
  await inv('after merge');
});

test('docVoid: a failure at commit or mid-operation changes nothing; success voids the document and all its rows; a repeat is a no-op; restore', async () => {
  const id = await p.evaluate(() => S.docs.find(d => d.type === 'invoice' && !d.void).id);
  await quota(true); const r1 = await same('void, quota', () => p.evaluate(id => docVoid(id, true), id)); await quota(false); assert(r1 === false, 'failed void reported success');
  for (const n of [1, 3]) { await stageFail(n); await same('void, failure at write ' + n, () => p.evaluate(id => docVoid(id, true), id)); await stageFail(0); }
  assert(await p.evaluate(id => docVoid(id, true), id), 'void failed'); await settle(p);
  const r = await p.evaluate(id => { const K = docLinked(id); return { doc: byId('docs', id).void, rows: [...K.moves, ...K.ledger || K.led || []].every(x => x.void), rem: lotStat(S.lots.find(l => !l.void)).rem }; }, id);
  assert(r.doc && r.rows && r.rem === 100, 'void: ' + JSON.stringify(r)); await inv('after void');
  await same('void repeated', () => p.evaluate(id => docVoid(id, true), id));
  assert(await p.evaluate(id => docVoid(id, false), id), 'restore failed'); await settle(p);
  assert(await p.evaluate(() => lotStat(S.lots.find(l => !l.void)).rem) === 90, 'restore did not bring the sale back'); await inv('after restore');
});

test('postDoc: failures at commit and at the 1st/2nd/3rd and the last write change nothing and leave the document unposted; a concurrent second posting is refused', async () => {
  await p.evaluate(async () => { const n = nowTs(); await putRaw('docs', { id: 'd_new', type: 'purchase', inv: false, personId: 'p_b', date: '2026-10-04', led: 'payable', items: [{ desc: 'عسل آزمون دو', qty: 10, unit: 'کیلو', price: 1e6 }], created: n, updated: n }); });
  const post = () => p.evaluate(() => postDoc({ ...byId('docs', 'd_new') }, 'd_new', 'payable', '', '').then(o => !!(o && !o.failed)));
  await quota(true); const r1 = await same('post, quota', post); await quota(false); assert(r1 === false, 'failed posting reported success');
  // how many records one posting writes (counted on a copy of the document, then undone by a failure at the end)
  const total = await p.evaluate(async () => { let c = 0; const st = Store.stage; Store.stage = function (...a) { c++; return st.apply(this, a); };
    const real = Store.tx; Store.tx = async () => ({ ok: false, error: new Error('count only') }); await postDoc({ ...byId('docs', 'd_new') }, 'd_new', 'payable', '', ''); Store.tx = real; Store.stage = st; return c; });
  assert(total >= 3, 'fixture: posting writes too few records: ' + total);
  for (const n of [1, 2, 3, total]) { await stageFail(n); await same('post, failure at write ' + n + ' of ' + total, post); await stageFail(0); }
  assert(await p.evaluate(() => !byId('docs', 'd_new').posted), 'document marked posted after failures');
  const both = await p.evaluate(() => Promise.all([0, 1].map(() => postDoc({ ...byId('docs', 'd_new') }, 'd_new', 'payable', '', '').then(o => !!(o && !o.failed))))); await settle(p);
  const r = await p.evaluate(() => ({ posted: !!byId('docs', 'd_new').posted, lots: S.lots.filter(l => !l.void && l.docId === 'd_new').length, rows: S.ledger.filter(l => !l.void && l.docId === 'd_new').length }));
  assert(both.filter(Boolean).length === 1 && r.posted && r.lots === 1 && r.rows >= 1, 'double posting: ' + JSON.stringify({ both, r }));
  const d0 = await disk(); await p.reload(); await settle(p); assert((await disk()) === d0, 'reload changed the database');
  await inv('after posting'); assert(!o.errors.length, o.errors.join(' | '));
});

test('a failed batch restores the undo list exactly', async () => {
  const r = await p.evaluate(async () => { undoOpen(); await save('people', null, { name: 'برای واگرد' });
    const st = Store.stage; let c = 0; Store.stage = function (...a) { if (++c === 2) throw new Error('synthetic'); return st.apply(this, a); };
    await putRaw('people', { id: 'p_u2', name: 'دوم', created: nowTs(), updated: nowTs() }); await putRaw('ledger', { id: 'l_u2', kind: 'receivable', personId: 'p_u2', amount: 1e6, currency: 'تومان', date: '2026-10-05', instrument: 'نسیه', created: nowTs(), updated: nowTs() });
    const before = JSON.stringify(UB.ops) + '|' + [...UB.seen].join(',') + '|' + UB.ops.length; const nb = UB.ops.length;
    const n = await mergePeople('p_a', 'p_u2'); Store.stage = st; return { n, nb, same: before === JSON.stringify(UB.ops) + '|' + [...UB.seen].join(',') + '|' + UB.ops.length }; });
  assert(r.n === 0 && r.nb >= 1 && r.same, 'undo list after a failed merge: ' + JSON.stringify(r));
});

test('two operations at once on different documents: the first fails, the second is committed in full and survives a reload', async () => {
  await p.evaluate(async () => { const n = nowTs(); await putRaw('docs', { id: 'd_b2', type: 'purchase', inv: false, personId: 'p_b', date: '2026-10-06', led: 'payable', items: [{ desc: 'عسل آزمون سه', qty: 5, unit: 'کیلو', price: 1e6 }], created: n, updated: n }); });
  const vid = await p.evaluate(() => S.docs.find(d => d.type === 'invoice' && !d.void && d.posted).id);
  const r = await p.evaluate(async vid => { const real = window.save, st = Store.stage; const ofA = x => x && (x.id === vid || x.docId === vid);
    // the void of document A waits a little at every write (so B is requested while A is still running) and fails at its last write
    window.save = async (...a) => { if (a[1] && (byId(a[0], a[1]) || {}).docId === vid || a[1] === vid) await new Promise(r => setTimeout(r, 30)); return real(...a); };
    Store.stage = function (B, col, doc, prev) { if (ofA(doc) && col === 'docs') throw new Error('synthetic failure of A'); return st.apply(this, arguments); };
    const A = docVoid(vid, true); await new Promise(r => setTimeout(r, 10)); const B = postDoc({ ...byId('docs', 'd_b2') }, 'd_b2', 'payable', '', '');
    const [ra, rb] = await Promise.all([A, B]); window.save = real; Store.stage = st;
    return { ra, rb: !!(rb && !rb.failed), aVoid: !!byId('docs', vid).void, aRows: docLinked(vid).led.some(l => l.void), bPosted: !!byId('docs', 'd_b2').posted, bLots: S.lots.filter(l => !l.void && l.docId === 'd_b2').length }; }, vid);
  assert(r.ra === false && !r.aVoid && !r.aRows, 'A was not fully rolled back: ' + JSON.stringify(r));
  assert(r.rb && r.bPosted && r.bLots === 1, 'B was not committed on its own: ' + JSON.stringify(r));
  await p.reload(); await settle(p);
  assert(await p.evaluate(vid => !!byId('docs', 'd_b2').posted && S.lots.filter(l => !l.void && l.docId === 'd_b2').length === 1 && !byId('docs', vid).void, vid), 'not on disk after reload');
  await inv('after concurrent operations');
});

test('an already-void document with one active linked row (an interrupted pre-4.40 void) is completed on retry', async () => {
  const id = await p.evaluate(() => S.docs.find(d => d.type === 'invoice' && !d.void && d.posted).id);
  assert(await p.evaluate(id => docVoid(id, true), id), 'void failed'); await settle(p);
  await p.evaluate(async id => { const l = docLinked(id).led[0]; await putRaw('ledger', { ...l, void: false }); }, id);   // simulate the half-done void
  assert(!(await p.evaluate(id => docVoidDone(id, true), id)), 'inconsistent document reported as done');
  assert(await p.evaluate(id => docVoid(id, true), id), 'retry failed'); await settle(p);
  const r = await p.evaluate(id => { const K = docLinked(id); return [...K.moves, ...K.lots, ...K.led].every(x => x.void) && byId('docs', id).void; }, id);
  assert(r, 'retry did not complete the void'); await inv('after completing the void');
  assert(await p.evaluate(id => docVoid(id, false), id), 'restore failed'); await settle(p); await inv('after restore');
});

test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
