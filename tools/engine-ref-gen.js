// Developer tool (never loaded by the app): records the information engine's output (data from qExec and the page from
// aiRun for every query, and every offline answer) on a synthetic business with the clock fixed → tests/fixtures/engine-ref.json.
// Run once on the code BEFORE the engine moves to js/engine.js (A2). Usage: MIZ_ROOT=<copy> node tools/engine-ref-gen.js
const fs = require('fs'), path = require('path');
const { serve, launch, openApp, seedFull, ROOT } = require('../tests/lib');
const { NOW, SEED, QUERIES, ASK, RANDOM } = require('../tests/engine-cases');
(async () => {
  const srv = await serve(); const o = await launch(); await o.page.clock.setFixedTime(new Date(NOW)); await o.page.addInitScript(RANDOM); await openApp(o, srv.url);
  await seedFull(o.page); await o.page.evaluate(`(${SEED.toString()})()`);
  const Q = QUERIES();
  const out = await o.page.evaluate(([Q, A]) => ({ data: Q.map(q => JSON.stringify(qExec(qNorm(q)))), page: Q.map(q => aiRun(q)), ask: A.map(a => askAnswer(a)) }), [Q, ASK]);
  out.Q = Q; out._meta = { source: process.env.MIZ_ROOT || ROOT, now: NOW };
  fs.writeFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'engine-ref.json'), JSON.stringify(out));
  console.log('queries', Q.length, 'offline', ASK.length); await o.ctx.close(); srv.close(); process.exit(0);
})();
