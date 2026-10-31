#!/usr/bin/env node
// Find code in index.html and the scripts in js/ without reading whole files (developer tool; never loaded by the app).
//   node tools/q.js fn <name>        source of a function (readable line breaks, index.html line numbers)
//   node tools/q.js act <name>       body of a click action (case in switch(a), or a==='name' in another listener)
//   node tools/q.js form <name>      the submit branch for data-form="name"
//   node tools/q.js writers <col>    where records of a collection are written (save/save0/putRaw) or deleted (delDoc)
//   node tools/q.js callers <fn>     where a function is called
//   node tools/q.js region <text>    region banners matching text, with their line ranges and functions
//   node tools/q.js map              all regions: first line, last line, number of functions
//   node tools/q.js tests <name>     test files that use a function/action/word, and the command that runs only those
// Options: MIZ_ROOT=<dir> to read another copy; --full to print long bodies without the 200-line cap.
'use strict';
const { load, build, pretty } = require('./parse');
const fs = require('fs'), path = require('path');
const [cmd, arg] = process.argv.slice(2).filter(a => !a.startsWith('--')); const FULL = process.argv.includes('--full');
const P = load();
// the other classic scripts (js/*.js) share the page's global scope: fn, callers and writers search them too
const ROOTD = process.env.MIZ_ROOT || path.resolve(__dirname, '..'), JSD = path.join(ROOTD, 'js');
const EXTRA = fs.existsSync(JSD) ? fs.readdirSync(JSD).filter(f => f.endsWith('.js')).sort().map(f => { const src = fs.readFileSync(path.join(JSD, f), 'utf8'); return { file: 'js/' + f, P: build(src, 0, src) }; }) : [];
const inExtras = fn => EXTRA.forEach(x => fn(x.P, x.file));
const cap = s => { const L = s.split('\n'); return FULL || L.length <= 200 ? s : L.slice(0, 200).join('\n') + `\n… ${L.length - 200} more lines (use --full)`; };
const show = (title, s, e, Q = P, file = 'index.html') => console.log(`── ${title} · ${file} L${Q.line(s)}–L${Q.line(e - 1)}\n` + cap(pretty(Q, s, e)));
const need = () => { if (!arg) { console.error('missing argument'); process.exit(2); } };
const group = list => { const g = {}; list.forEach(({ at, what }) => { const k = P.encl(at); (g[k] = g[k] || []).push(`L${P.line(at)}${what ? ' ' + what : ''}`); }); return g; };
const printGroup = g => { const ks = Object.keys(g).sort(); ks.forEach(k => console.log(`${k.padEnd(28)} ${g[k].length}×  ${g[k].join(', ')}`)); console.log(`— ${ks.length} places, ${ks.reduce((a, k) => a + g[k].length, 0)} calls`); };

switch (cmd) {
  case 'fn': { need(); let n = 0; const f = P.fn(arg); f.forEach(x => show(`${x.kind} ${x.name}`, x.start, x.end)); n += f.length;
    inExtras((Q, file) => { const g = Q.fn(arg); g.forEach(x => show(`${x.kind} ${x.name}`, x.start, x.end, Q, file)); n += g.length; });
    if (!n) { console.error('no function ' + arg); process.exit(1); } break; }
  case 'act': { need(); const c = P.cases.filter(x => x.name === arg), o = P.otherActs.filter(x => x.name === arg);
    if (!c.length && !o.length) { console.error('no action ' + arg); process.exit(1); }
    c.forEach(x => show(`case '${x.name}' in switch(a)`, x.start, x.end));
    o.forEach(x => { const ib = P.ifBlock(x.start) || { start: x.start, end: x.end }; show(`a==='${x.name}' in a listener (${P.encl(x.start)})`, ib.start, ib.end); }); break; }
  case 'form': { need(); const f = P.forms.filter(x => x.name === arg && x.kind === 'form'); if (!f.length) { console.error('no submit branch ' + arg); process.exit(1); }
    f.forEach(x => show(`submit branch '${x.name}'`, x.start, x.end)); break; }
  case 'writers': { need(); const re = new RegExp(`\\b(save|save0|putRaw|delDoc)\\(\\s*'${arg}'`, 'g');
    const hits = P.find(re).map(({ at, m }) => ({ at, what: m[1] })); printGroup(group(hits));
    inExtras((Q, file) => { const h = Q.find(re); if (h.length) console.log(`${file}: ${h.length}× at L${h.map(({ at }) => Q.line(at)).join(', L')}`); });
    const dyn = P.find(/\b(save|save0|putRaw|delDoc)\(\s*(?!')[A-Za-z_$]/g).map(({ at, m }) => ({ at, what: m[1] }));
    console.log(`(+ ${dyn.length} calls with a variable collection name in ${Object.keys(group(dyn)).length} places: node tools/q.js callers save)`); break; }
  case 'callers': { need(); const re = new RegExp(`(?<![.\\w$])${arg.replace(/\$/g, '\\$')}\\s*\\(`, 'g');
    const hits = P.find(re).filter(({ at }) => !/function\s*$/.test(P.js.slice(Math.max(0, at - 12), at)) && !/async\s+function\s*$/.test(P.js.slice(Math.max(0, at - 20), at))).map(({ at }) => ({ at }));
    printGroup(group(hits));
    inExtras((Q, file) => { const h = Q.find(re).filter(({ at }) => !/function\s*$/.test(Q.js.slice(Math.max(0, at - 12), at))); if (h.length) console.log(`${file}: ${h.length}× at L${h.map(({ at }) => Q.line(at)).join(', L')}`); }); break; }
  case 'region': { need(); const q = arg.toLowerCase(); const R = P.regions.filter(r => r.title.toLowerCase().includes(q)); if (!R.length) { console.error('no region matching ' + arg); process.exit(1); }
    R.forEach(r => { const fs = P.fns.filter(f => { const l = P.line(f.start); return l >= r.line && l <= r.endLine && f.kind === 'function'; });
      console.log(`L${r.line}–L${r.endLine}  ${r.title}\n  functions (${fs.length}): ${fs.map(f => f.name + ' L' + P.line(f.start)).join(', ')}`); }); break; }
  case 'map': { console.log(`index.html: ${P.html.trimEnd().split('\n').length} lines · script L${P.line(0)}–L${P.line(P.js.length - 1)} · ${P.fns.filter(f => f.kind === 'function').length} functions · ${P.cases.length} click actions · ${P.handledForms.size} forms`);
    P.regions.forEach(r => { const n = P.fns.filter(f => f.kind === 'function' && P.line(f.start) >= r.line && P.line(f.start) <= r.endLine).length;
      console.log(`L${String(r.line).padEnd(5)}–L${String(r.endLine).padEnd(5)} ${String(n).padStart(3)} fn  ${r.title.slice(0, 90)}`); });
    if (P.switchRange) console.log(`click actions: switch(a) L${P.line(P.switchRange[0])}–L${P.line(P.switchRange[1])}`); break; }
  case 'tests': { need(); const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', 'tests'); const re = new RegExp(`(?<![\\w$])${arg.replace(/[$.*+?()[\]{}|\\^]/g, '\\$&')}(?![\\w$])`);
    const hit = fs.readdirSync(dir).filter(f => /^\d\d-.*\.test\.js$/.test(f) && re.test(fs.readFileSync(path.join(dir, f), 'utf8'))).sort();
    if (!hit.length) { console.log('no test file mentions ' + arg + ' — add one; the full suite still runs before a release'); break; }
    hit.forEach(f => console.log('  tests/' + f)); console.log('run only these:  sh tests/run.sh ' + hit.map(f => f.slice(0, 2)).filter((x, i, a) => a.indexOf(x) === i).join(' ')); break; }
  default: console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(1, 12).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(cmd ? 2 : 0);
}
