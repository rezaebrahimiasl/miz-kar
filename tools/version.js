#!/usr/bin/env node
// WP-5: one tool for the app version (developer tool; never loaded by the app). It edits files only: no git, no commit, push or deploy.
//   node tools/version.js check        list every version place; exit 1 when they disagree or the release notes are missing
//   node tools/version.js set X.Y      write X.Y into every place below (only a higher version), then run check
//   node tools/version.js set X.Y --dry   show what would change, write nothing
// Places: index.html APP_VER · js/*.js <NAME>_VER (every part in APP_PARTS) · sw.js cache name miz-kar-vX.Y · version.json.
// Checked, never written (they need words): the WHATS_NEW group ['X.Y',[ in index.html and a «## vX.Y» section in HANDOFF.md.
// MIZ_ROOT=<dir> works on another copy (tests use it).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = process.env.MIZ_ROOT || path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const VRE = '(\\d+(?:\\.\\d+)*)';

function parts() {
  const m = rd('index.html').match(/const APP_PARTS=\{([^}]*)\}/);
  if (!m) throw new Error('APP_PARTS not found in index.html');
  return [...m[1].matchAll(/'([^']+)':'([A-Z_]+)'/g)].map(x => ({ file: x[1], key: x[2] }));
}
// every place: file, a regular expression with one version group, and how to write a version into it
function places() {
  const P = [{ file: 'index.html', name: 'APP_VER', re: new RegExp(`const APP_VER='${VRE}';`), put: v => `const APP_VER='${v}';` }];
  for (const p of parts()) P.push({ file: p.file, name: p.key, re: new RegExp(`const ${p.key}='${VRE}';`), put: v => `const ${p.key}='${v}';` });
  P.push({ file: 'sw.js', name: 'cache name', re: new RegExp(`const V='miz-kar-v${VRE}';`), put: v => `const V='miz-kar-v${v}';` });
  P.push({ file: 'version.json', name: 'version.json', re: new RegExp(`"v":\\s*"${VRE}"`), put: v => `"v": "${v}"` });
  return P;
}
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

function check(quiet) {
  const found = places().map(p => { const t = rd(p.file), m = t.match(p.re); const n = (t.match(new RegExp(p.re.source, 'g')) || []).length; return { ...p, v: m ? m[1] : null, n }; });
  const bad = [], vs = [...new Set(found.map(f => f.v))];
  found.forEach(f => { if (!f.v) bad.push(`${f.file}: ${f.name} not found`); else if (f.n !== 1) bad.push(`${f.file}: ${f.name} appears ${f.n} times`); });
  if (vs.length > 1) bad.push('versions disagree: ' + found.map(f => `${f.file} ${f.name}=${f.v}`).join(', '));
  const v = found[0].v;
  if (v && !rd('index.html').includes(`['${v}',[`)) bad.push(`index.html: no WHATS_NEW group ['${v}',[ (release notes, Persian, user-facing)`);
  if (v && !new RegExp(`^## v${v.replace('.', '\\.')}\\b`, 'm').test(rd('HANDOFF.md'))) bad.push(`HANDOFF.md: no «## v${v}» section`);
  if (!quiet) { found.forEach(f => console.log(`${(f.file + ' ' + f.name).padEnd(34)} ${f.v || '—'}`)); console.log(bad.length ? '\nNOT CONSISTENT:\n- ' + bad.join('\n- ') : `\nconsistent: ${v}`); }
  return { v, bad };
}

function set(v, dry) {
  if (!/^\d+\.\d+$/.test(v || '')) { console.error('usage: node tools/version.js set X.Y [--dry]'); process.exit(2); }
  const cur = check(true).v;
  if (cur && cmp(v, cur) <= 0) { console.error(`refused: ${v} is not higher than the current ${cur} (the app only updates to a higher version)`); process.exit(2); }
  const byFile = {};
  for (const p of places()) { const t = byFile[p.file] ?? rd(p.file); if (!p.re.test(t)) { console.error(`refused: ${p.file} has no ${p.name}`); process.exit(2); } byFile[p.file] = t.replace(p.re, p.put(v)); }
  for (const [f, t] of Object.entries(byFile)) { if (t === rd(f)) continue; console.log((dry ? 'would write ' : 'wrote ') + f); if (!dry) fs.writeFileSync(path.join(ROOT, f), t); }
  if (dry) return 0;
  const r = check(false);
  if (r.bad.length) console.log('\nStill to do by hand (words, not numbers): add the WHATS_NEW group and the HANDOFF.md section, then run check again.');
  console.log('Nothing was committed, pushed or deployed.');
  return r.bad.length ? 1 : 0;
}

const [cmd, arg] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (cmd === 'check') process.exit(check(false).bad.length ? 1 : 0);
else if (cmd === 'set') process.exit(set(arg, process.argv.includes('--dry')));
else { console.error('usage: node tools/version.js check | set X.Y [--dry]'); process.exit(2); }
