// Static checks, no browser (~1 s).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), os = require('os');
const { ROOT, test, run, assert } = require('./lib');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

test('script parses (node --check)', () => {
  const f = path.join(os.tmpdir(), 'miz-check.js'); fs.writeFileSync(f, js); execFileSync(process.execPath, ['--check', f]);
});
test('every action name in the main switch is unique', () => {
  const sw = js.slice(js.indexOf('switch(a){'));
  const seen = {}, dup = []; for (const m of sw.matchAll(/case'([A-Za-z0-9_]+)'/g)) { if (seen[m[1]]) dup.push(m[1]); seen[m[1]] = 1; }
  assert(!dup.length, 'duplicate case labels: ' + [...new Set(dup)].join(', '));
});
test('APP_VER, sw.js cache name and version.json agree', () => {
  const v = (html.match(/const APP_VER='([\d.]+)'/) || [])[1];
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).v;
  assert(sw.includes(`miz-kar-v${v}'`) && vj === v, `APP_VER ${v}, version.json ${vj}, sw.js ${(sw.match(/miz-kar-v[\d.]+/) || [])[0]}`);
});
test('every file the service worker pre-caches exists locally', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); const list = JSON.parse(sw.match(/SHELL=(\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const miss = list.filter(f => f !== './' && !fs.existsSync(path.join(ROOT, f))); assert(!miss.length, 'missing: ' + miss.join(', '));
});
run(__filename);
