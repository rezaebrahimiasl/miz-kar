// Documentation stays consistent with the code (no browser, ~0.1 s).
const fs = require('fs'), path = require('path');
const { ROOT, test, run, assert } = require('./lib');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = rd('index.html'), sw = rd('sw.js');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const DOCS = ['docs/ARCHITECTURE.md', 'docs/DATA.md', 'docs/RELEASE.md', 'docs/BACKLOG.md'];

test('DATA.md lists exactly the collections in S (COLS)', () => {
  const cols = js.match(/const S=\{([^}]*)\}/)[1].split(',').map(x => x.split(':')[0].trim());
  const sec = rd('docs/DATA.md').split('## 1. Collections')[1].split('\n## ')[0];
  const doc = [...sec.matchAll(/^\| ([a-z]+) \|/gm)].map(m => m[1]).filter(x => x !== 'collection');
  const miss = cols.filter(c => !doc.includes(c)), extra = doc.filter(c => !cols.includes(c));
  assert(!miss.length && !extra.length && doc.length === cols.length, `missing: ${miss} · extra: ${extra} · documented ${doc.length} vs ${cols.length}`);
});

test('ARCHITECTURE.md pre-cache list equals SHELL in sw.js', () => {
  const shell = JSON.parse(sw.match(/SHELL=(\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const line = rd('docs/ARCHITECTURE.md').split('\n').find(l => l.startsWith('| Pre-cached files'));
  const doc = [...line.matchAll(/`([^`]+)`/g)].map(m => m[1]).filter(x => x !== 'SHELL');
  assert(JSON.stringify(doc) === JSON.stringify(shell), `docs ${JSON.stringify(doc)} vs sw.js ${JSON.stringify(shell)}`);
});

test('every function written as `name()` in docs exists in the app or service worker', () => {
  const missing = [];
  for (const f of DOCS) for (const m of rd(f).matchAll(/`([A-Za-z_$][\w$]*)\(\)`/g)) {
    const n = m[1], re = new RegExp(`(function\\s+${n}\\s*\\(|(const|let|var)\\s+${n}\\s*=)`);
    if (!re.test(js) && !re.test(sw)) missing.push(`${f}: ${n}`);
  }
  assert(!missing.length, 'not found: ' + [...new Set(missing)].join(', '));
});

test('fixed account codes in DATA.md exist in the chart of accounts', () => {
  const coa = js.slice(js.indexOf('const COA='), js.indexOf('return a.map', js.indexOf('const COA=')));
  const codes = [...rd('docs/DATA.md').split('## 3.')[1].split('\n## ')[0].matchAll(/^\| (\d{4}) \|/gm)].map(m => m[1]);
  const miss = codes.filter(c => !coa.includes(`'${c}'`)); assert(codes.length >= 15 && !miss.length, 'not in COA: ' + miss.join(', '));
});

test('files and names cited as dead or unused are really unreferenced', () => {
  const dead = ['vBiz', 'myAcctsOld', 'restoreJsonOld', 'fHint'].filter(n => (js.match(new RegExp(`\\b${n}\\b`, 'g')) || []).length !== 1);
  const icons = ['icon-192.png', 'icon-512.png'].filter(f => html.includes(f) || sw.includes(f) || rd('manifest.webmanifest').includes(f));
  assert(!dead.length && !icons.length, `now referenced: ${dead.concat(icons).join(', ')} — update docs/BACKLOG.md`);
});

test('version rules in RELEASE.md match the code: update only to a higher version', () => {
  assert(/verNum\(v\)>verNum\(APP_VER\)/.test(js), 'checkUpdate no longer compares versions — update docs/RELEASE.md §6');
});
run(__filename);
