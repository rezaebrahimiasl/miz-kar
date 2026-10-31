// Information engine: qExec data, «پرسش از داده‌ها» pages and offline answers must equal the outputs recorded from
// unchanged v4.30 (tests/fixtures/engine-ref.json; 156 queries + 17 questions on a synthetic business, clock and ids fixed).
const fs = require('fs'), path = require('path');
const { serve, launch, openApp, seedFull, test, run, assert } = require('./lib');
const { NOW, SEED, QUERIES, ASK, RANDOM } = require('./engine-cases');
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'engine-ref.json'), 'utf8'));
let srv, o, got;
test('the same synthetic business, clock and ids as the recording', async () => {
  srv = await serve(); o = await launch(); await o.page.clock.setFixedTime(new Date(NOW)); await o.page.addInitScript(RANDOM); await openApp(o, srv.url);
  await seedFull(o.page); await o.page.evaluate(`(${SEED.toString()})()`);
  const Q = QUERIES(); assert(JSON.stringify(Q) === JSON.stringify(REF.Q), 'query list differs from the recording');
  got = await o.page.evaluate(([Q, A]) => ({ data: Q.map(q => JSON.stringify(qExec(qNorm(q)))), page: Q.map(q => aiRun(q)), ask: A.map(a => askAnswer(a)) }), [Q, ASK]);
});
for (const k of ['data', 'page', 'ask']) test(`${k}: identical to v4.30 (${REF[k].length})`, () => {
  const bad = REF[k].map((x, i) => x === got[k][i] ? null : i).filter(x => x !== null);
  assert(!bad.length, `${bad.length} differ, first: ${k === 'ask' ? ASK[bad[0]] : JSON.stringify(REF.Q[bad[0]])}`);
});
test('no page errors', async () => { assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
