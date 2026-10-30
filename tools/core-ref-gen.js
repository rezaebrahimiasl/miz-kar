// Developer tool (never loaded by the app): records the outputs of the core utilities (dates, Jalali calendar, digits,
// escaping, number and money formatting) from a given copy of the app, with the clock fixed, into tests/fixtures/core-ref.json.
// It was run ONCE on the unchanged v4.30 code (25163ab) before js/core.js existed; tests/46-core-ref.test.js compares against it.
// Usage: MIZ_ROOT=<copy of the app> node tools/core-ref-gen.js
const fs = require('fs'), path = require('path');
const { serve, launch, openApp, ROOT } = require('../tests/lib');
const { NOW, CASES } = require('../tests/core-cases');
(async () => {
  const srv = await serve(); const o = await launch(); await o.page.clock.setFixedTime(new Date(NOW)); await openApp(o, srv.url);
  const out = await o.page.evaluate(`(${CASES.toString()})()`);
  out._meta = { source: process.env.MIZ_ROOT || ROOT, now: NOW, note: 'outputs of the v4.30 core utilities; generated once before the extraction' };
  fs.writeFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'core-ref.json'), JSON.stringify(out));
  console.log('cases:', Object.entries(out).filter(([k]) => k !== '_meta').map(([k, v]) => k + '=' + (Array.isArray(v) ? v.length : Object.keys(v).length)).join(' '));
  await o.ctx.close(); srv.close(); process.exit(0);
})();
