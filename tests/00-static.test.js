// Static checks, no browser (~1 s).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), os = require('os');
const { ROOT, test, run, assert } = require('./lib');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8'), engine = fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8'), backup = fs.readFileSync(path.join(ROOT, 'js', 'backup.js'), 'utf8');
// js/core.js, js/engine.js and the inline scripts share one global scope: checked as one file, so a name declared twice is a syntax error here too
const js = [core, engine, backup, ...[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])].join('\n');

test('js/core.js + js/engine.js + inline scripts parse together (node --check; no name declared twice)', () => {
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
  const cv = (core.match(/const CORE_VER='([\d.]+)';/) || [])[1], ev = (engine.match(/const ENGINE_VER='([\d.]+)';/) || [])[1], bv = (backup.match(/const BACKUP_VER='([\d.]+)';/) || [])[1];
  assert(sw.includes(`miz-kar-v${v}'`) && vj === v && cv === v && ev === v && bv === v, `APP_VER ${v}, CORE_VER ${cv}, ENGINE_VER ${ev}, BACKUP_VER ${bv}, version.json ${vj}, sw.js ${(sw.match(/miz-kar-v[\d.]+/) || [])[0]}`);
});
test('every file the service worker pre-caches exists locally', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); const list = JSON.parse(sw.match(/SHELL=(\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const miss = list.filter(f => f !== './' && !fs.existsSync(path.join(ROOT, f))); assert(!miss.length, 'missing: ' + miss.join(', '));
});
test('js/core.js then js/engine.js are classic scripts loaded before the main script, and the start-up guard comes before any data access', () => {
  const tag = html.indexOf('<script src="js/core.js"></script>'), main = html.indexOf('<script>'), guard = html.indexOf("CORE_VER===APP_VER"), db = html.indexOf('async function initDb(');
  const etag = html.indexOf('<script src="js/engine.js"></script>');
  assert(tag > 0 && tag < main && !/type=["']module/.test(html.slice(tag - 40, tag + 60)), 'core.js tag missing, after the main script, or a module');
  assert(etag > tag && etag < main && !/type=["']module/.test(html.slice(etag - 40, etag + 60)), 'engine.js tag missing, before core, after the main script, or a module');
  assert(html.indexOf('ENGINE_VER===APP_VER') > main && html.indexOf('ENGINE_VER===APP_VER') < db, 'guard must check ENGINE_VER');
  assert(guard > main && guard < db && html.indexOf('/* Google sign-in returns here') < guard, 'guard position: token capture → guard → data');
  assert(!/^\s*(import|export)\s/m.test(core), 'core.js must not be a module');
  assert(!/^\s*(import|export)\s/m.test(engine), 'engine.js must not be a module');
  assert(!/^\s*(import|export)\s/m.test(backup), 'backup.js must not be a module');
});
// one list of the app's separate files, kept in step everywhere: sw.js PARTS = index.html APP_PARTS = the <script src> tags before
// the main script (same order) = what the start-up guard checks; each file declares its marker. Adding a file and missing a place fails here.
test('the app parts list agrees: sw.js PARTS, APP_PARTS, script tags, the start-up guard, each file\'s marker', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); const obj = t => JSON.parse(t.replace(/'/g, '"'));
  const P = obj(sw.match(/const PARTS=(\{[^}]*\})/)[1]), A = obj(html.match(/const APP_PARTS=(\{[^}]*\})/)[1]);
  assert(JSON.stringify(P) === JSON.stringify(A), 'sw.js PARTS ≠ APP_PARTS: ' + JSON.stringify({ P, A }));
  const main = html.indexOf('<script>'), tags = [...html.slice(0, main).matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
  assert(JSON.stringify(tags) === JSON.stringify(Object.keys(A)), 'script tags before the main script ≠ APP_PARTS: ' + tags.join(', '));
  const shell = obj(sw.match(/SHELL=(\[[^\]]*\])/)[1]); const guard = html.slice(html.indexOf('/* ---------- Start-up guard'), html.indexOf("throw new Error('miz-core: '"));
  for (const [f, k] of Object.entries(A)) {
    assert(shell.includes(f), f + ' not in sw.js SHELL');
    assert(new RegExp('^const ' + k + "='[\\d.]+';", 'm').test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f + ' has no ' + k + ' marker');
    assert(guard.includes(k + '===APP_VER') && guard.includes("'" + f + "':typeof " + k), 'start-up guard does not check ' + f + ' (' + k + ')');
  }
});
run(__filename);
