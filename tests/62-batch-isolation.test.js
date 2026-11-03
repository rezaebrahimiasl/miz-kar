// Isolation between an operation (Store.batch) and ordinary writes made while it runs (for example while it waits for a dialog):
// an ordinary write to another record commits at once and is never committed or rolled back with the operation; an ordinary write
// to a record the operation has staged waits until the operation has ended and then applies on top of the real state; undo entries
// and the dirty counter of the ordinary writes are kept; everything survives a reload. Synthetic data only.
const { serve, launch, openApp, settle, seedSmall, openDoc, submit, invariants, test, run, assert } = require('./lib');
let srv, o, p, lot;
const inv = async what => { const v = await invariants(p); assert(!v.length, what + ': ' + v.join('; ')); };
// in the page: slow down the operation's own writes (they carry the operation B as 4th argument), optionally fail its document write
const scenario = (vid, fail) => p.evaluate(async ([vid, fail]) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const real = window.save, st = Store.stage; const order = [];
  window.save = async (...a) => { if (a[3]) await sleep(40); return real(...a); };
  if (fail) Store.stage = function (B, col, doc) { if (col === 'docs' && doc.id === vid) throw new Error('synthetic failure'); return st.apply(this, arguments); };
  const get = k => new Promise(r => { const q = idb.transaction('docs').objectStore('docs').get(k); q.onsuccess = () => r(q.result ? q.result.doc : null); });
  undoOpen(); const dv0 = window._dv || 0, un0 = Number(localStorage.getItem('miz.unsent') || 0); const l0 = docLinked(vid).led[0].id;
  let aDone = false; const A = docVoid(vid, true).then(r => { aDone = true; order.push('A'); return r; });
  await sleep(15);
  // (1) unrelated record: commits while the operation is still running
  const tag = fail ? 'مستقل-شکست' : 'مستقل-موفق';
  const r1 = await save('people', 'p_a', { note: tag }); const disk1 = await get('people/p_a'); const beforeA = !aDone;
  // (2) a record the operation has staged: waits for the operation
  for (let i = 0; i < 100 && !Store.held('ledger', l0); i++) await sleep(10);   // wait until the operation has staged that row
  const held = Store.held('ledger', l0);
  const r2p = save('ledger', l0, { about: 'یادداشت عادی ' + tag }).then(r => { order.push(Store._act === null ? 'ordinary-after-end' : 'ordinary-during'); return r; });
  const [ra, r2] = await Promise.all([A, r2p]); window.save = real; Store.stage = st;
  const led = byId('ledger', l0), dled = await get('ledger/' + l0);
  return { ra, r1, r2, beforeA, held, disk1: disk1 && disk1.note === tag, order, docVoid: !!byId('docs', vid).void, ledVoid: !!led.void, ledAbout: led.about, dledAbout: dled && dled.about, dledVoid: !!(dled && dled.void),
    undoKeys: UB.ops.map(x => x.col + '/' + x.id), dv: (window._dv || 0) - dv0, un: Number(localStorage.getItem('miz.unsent') || 0) - un0, l0, tag };
}, [vid, fail]);

test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page; lot = await seedSmall(p); await settle(p);
  await openDoc(p, { type: 'invoice', personId: 'p_a', date: '2026-10-02', led: 'receivable', items: [{ desc: 'عسل آزمون', qty: 10, unit: 'کیلو', price: 1e6, src: 'lot', lotId: lot }] }); await submit(p); await settle(p); await inv('fixtures'); });

test('operation FAILS while ordinary writes are made: the unrelated write commits at once and stays; the waiting write applies on the original state', async () => {
  const vid = await p.evaluate(() => S.docs.find(d => d.type === 'invoice' && !d.void && d.posted).id);
  const r = await scenario(vid, true); await settle(p);
  assert(r.ra === false && !r.docVoid && !r.ledVoid && !r.dledVoid, 'operation not rolled back: ' + JSON.stringify(r));
  assert(r.r1 && r.disk1 && r.beforeA, 'unrelated write did not commit independently while the operation ran: ' + JSON.stringify(r));
  assert(r.held && r.r2 && r.order.includes('ordinary-after-end') && !r.order.includes('ordinary-during') && r.ledAbout === 'یادداشت عادی ' + r.tag && r.dledAbout === r.ledAbout, 'staged-record write: ' + JSON.stringify(r));
  assert(r.undoKeys.includes('people/p_a') && r.undoKeys.includes('ledger/' + r.l0) && !r.undoKeys.includes('docs/' + vid), 'undo list: ' + JSON.stringify(r.undoKeys));
  assert(r.dv === 2 && r.un === 2, 'dirty/unsent counters should count only the 2 ordinary writes: ' + JSON.stringify(r));
  await p.reload(); await settle(p);
  assert(await p.evaluate(([vid, l0, tag]) => byId('people', 'p_a').note === tag && !byId('docs', vid).void && byId('ledger', l0).about === 'یادداشت عادی ' + tag, [vid, r.l0, r.tag]), 'after reload'); await inv('after failed operation');
});

test('operation SUCCEEDS while ordinary writes are made: both are committed, each on its own; the waiting write lands on the voided row', async () => {
  const vid = await p.evaluate(() => S.docs.find(d => d.type === 'invoice' && !d.void && d.posted).id);
  const r = await scenario(vid, false); await settle(p);
  assert(r.ra === true && r.docVoid && r.ledVoid && r.dledVoid, 'operation not committed: ' + JSON.stringify(r));
  assert(r.r1 && r.disk1 && r.beforeA, 'unrelated write did not commit independently: ' + JSON.stringify(r));
  assert(r.held && r.order.includes('ordinary-after-end') && !r.order.includes('ordinary-during') && r.dledAbout === 'یادداشت عادی ' + r.tag && r.ledVoid, 'staged-record write: ' + JSON.stringify(r));
  assert(r.undoKeys.includes('people/p_a') && r.dv > 2, 'counters/undo: ' + JSON.stringify(r));
  await p.reload(); await settle(p);
  assert(await p.evaluate(([vid, l0, tag]) => byId('people', 'p_a').note === tag && !!byId('docs', vid).void && byId('ledger', l0).void && byId('ledger', l0).about === 'یادداشت عادی ' + tag, [vid, r.l0, r.tag]), 'after reload'); await inv('after successful operation');
  assert(await p.evaluate(id => docVoid(id, false), vid), 'restore'); await settle(p); await inv('after restore'); assert(!o.errors.length, o.errors.join(' | '));
});

test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
