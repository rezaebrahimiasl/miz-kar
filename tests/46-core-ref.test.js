// Core utilities (Jalali calendar, dates, digits, escaping, number and money formatting) must give exactly the outputs
// recorded from the unchanged v4.30 code (tests/fixtures/core-ref.json, generated before js/core.js existed), clock fixed.
const fs = require('fs'), path = require('path');
const { serve, launch, openApp, test, run, assert } = require('./lib');
const { NOW, CASES } = require('./core-cases');
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'core-ref.json'), 'utf8'));
let srv, o, got;
test('the core utilities run with the clock fixed at the moment the reference was recorded', async () => {
  srv = await serve(); o = await launch(); await o.page.clock.setFixedTime(new Date(NOW)); await openApp(o, srv.url);
  got = await o.page.evaluate(`(${CASES.toString()})()`);
  assert(REF._meta && REF._meta.now === NOW, 'reference file is not the recorded one');
});
for (const k of Object.keys(REF).filter(k => k !== '_meta'))
  test(`${k}: identical to v4.30 (${Array.isArray(REF[k]) ? REF[k].length : Object.keys(REF[k]).length} cases)`, () => {
    const a = REF[k], b = got[k];
    if (Array.isArray(a)) { assert(Array.isArray(b) && b.length === a.length, `${k}: ${b && b.length} cases, expected ${a.length}`);
      const bad = a.map((x, i) => JSON.stringify(x) === JSON.stringify(b[i]) ? null : `#${i} want ${JSON.stringify(x)} got ${JSON.stringify(b[i])}`).filter(Boolean);
      assert(!bad.length, bad.length + ' differ: ' + bad.slice(0, 3).join(' · ')); }
    else assert(JSON.stringify(a) === JSON.stringify(b), `${k} differs`);
  });
test('no page errors', async () => { assert(!o.errors.length, o.errors.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
