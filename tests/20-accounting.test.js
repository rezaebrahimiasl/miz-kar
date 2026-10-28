// Accounting and inventory invariants through a full synthetic business cycle (real forms). Synthetic data only.
const { serve, launch, openApp, sig, seedFull, invariants, test, run, assert } = require('./lib');
let srv, o; const steps = [];

// Golden fingerprint of the seed below (live rows per collection, balance per account, person balances).
// Recorded on v4.21 (af7854d). To change it deliberately, follow «Updating the golden fingerprint» in tests/README.md.
const GOLDEN = process.env.MIZ_GOLDEN_PRINT ? null : {"rows":{"people":4,"ledger":8,"lots":3,"moves":4,"vouchers":3,"meta":2,"docs":6},"gl":{"1101":186000000,"1201":6450000,"1301":53900000,"2101":-36000000,"2201":-450000,"3101":-200000000,"4101":-41500000,"4990":3500000,"5001":23100000,"5106":5000000},"pb":{"p_b":{"تومان":-36000000},"p_a":{"تومان":1500000},"p_c":{"تومان":4950000}}};

test('full cycle: invariants hold after every step', async () => {
  srv = await serve(); o = await launch(); await openApp(o, srv.url);
  await seedFull(o.page, async name => { const bad = await invariants(o.page); steps.push(name); assert(!bad.length, `after «${name}»: ${bad.join('; ')}`); });
  assert(steps.length === 13, 'expected 13 steps, ran ' + steps.length);
});

test('stock after the cycle: گون 100−30−2+2(void)=70, کنار 50−20+5=35, آویشن 10−3=7', async () => {
  const r = await o.page.evaluate(() => Object.fromEntries(S.lots.filter(l => !l.void).map(l => [l.variety, lotStat(l).rem])));
  assert(r['گون'] === 70 && r['کنار'] === 35 && r['آویشن'] === 7, JSON.stringify(r));
});

test('edited sale replaced the old version; voided gift has no live stock or money effect', async () => {
  const r = await o.page.evaluate(() => ({
    live: S.docs.filter(d => !d.void && d.type === 'invoice' && d.personId === 'p_c').map(d => d.items[0].qty),
    giftMoves: S.moves.filter(m => !m.void && m.kind === 'gift').length }));
  assert(JSON.stringify(r.live) === '[3]' && r.giftMoves === 0, JSON.stringify(r));
});

test('golden fingerprint unchanged', async () => {
  const fp = JSON.parse(await sig(o.page));
  if (!GOLDEN) { console.log('  candidate fingerprint: ' + JSON.stringify(fp));
    throw new Error('MIZ_GOLDEN_PRINT is set: fingerprint printed, comparison NOT performed — this run fails by design'); }
  assert(JSON.stringify(fp) === JSON.stringify(GOLDEN), 'fingerprint changed:\n      now    ' + JSON.stringify(fp) + '\n      golden ' + JSON.stringify(GOLDEN));
});

test('no page errors, no external network', async () => {
  assert(!o.errors.length, o.errors.join(' | ')); assert(!o.net.external.length, o.net.external.join(' | ')); await o.ctx.close(); srv.close();
});
run(__filename);
