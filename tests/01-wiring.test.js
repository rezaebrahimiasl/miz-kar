// Static wiring checks, no browser (~1 s): every button, form, menu entry, «تازه‌ها» destination and help key
// points at code that exists. Uses the scanner in tools/parse.js (strings, templates, comments, regex aware).
const path = require('path');
const { ROOT, test, run, assert } = require('./lib');
const { load } = require(path.join(__dirname, '..', 'tools', 'parse'));
let P, tabs;
const list = (a, n = 12) => a.slice(0, n).join(', ') + (a.length > n ? ` … (+${a.length - n})` : '');

test('scanner: script is balanced and every function, action and form body parses on its own', () => {
  P = load(ROOT); const vm = require('vm'); const bad = [];
  assert(P.balanced, 'brace depth does not return to 0');
  for (const f of P.fns) { try { new vm.Script(f.kind === 'function' ? '(' + P.js.slice(f.start, f.end) + ')' : P.js.slice(f.start, f.end)); } catch (e) { bad.push('fn ' + f.name); } }
  for (const c of P.cases) { try { new vm.Script('async function _(){switch(1){case 1:' + P.js.slice(c.start, c.end).replace(/^case\s*'[^']+'\s*:/, '') + '}}'); } catch (e) { bad.push('act ' + c.name); } }
  assert(!bad.length, 'scanner mis-cut: ' + list(bad));
  assert(P.fns.length > 500 && P.cases.length > 400 && P.handledForms.size > 50, `too little found: ${P.fns.length} fns, ${P.cases.length} actions, ${P.handledForms.size} forms`);
  tabs = new Set([...P.html.matchAll(/data-tab="([a-z]+)"/g)].map(m => m[1]).concat(P.find(/\btab\s*===\s*'([a-z]+)'/g).map(x => x.m[1])));
});

test('every data-act in the page has a handler (switch(a) case or a===… in a data-act listener)', () => {
  const acts = [...new Set([...P.html.matchAll(/data-act="([A-Za-z0-9_]+)"/g)].map(m => m[1]))];
  const miss = acts.filter(a => !P.handledActs.has(a)); assert(!miss.length, `${miss.length} buttons do nothing: ` + list(miss));
});

test('every data-form has a submit branch', () => {
  const forms = [...new Set([...P.html.matchAll(/data-form="([A-Za-z0-9_]+)"/g)].map(m => m[1]))];
  const miss = forms.filter(f => !P.handledForms.has(f)); assert(!miss.length, `${miss.length} forms are never saved: ` + list(miss));
});

const target = g => { if (!g) return true; const [x, y] = String(g).split('|'); return x === 'tab' ? tabs.has(y) : x === 'new' || P.handledActs.has(x); };
test('every «تازه‌ها» destination, menu entry (ACTS) and catalogue entry opens an existing action or tab', () => {
  const W = P.literal('WHATS_NEW'), C = P.literal('CATALOG'), A = P.literal('ACTS'); assert(W && C && A, 'WHATS_NEW, CATALOG or ACTS not found');
  const bad = [];
  W.forEach(([v, a]) => a.forEach(x => { if (x[4] && !target(x[4])) bad.push(`WHATS_NEW ${v} «${x[2]}» → ${x[4]}`); }));
  A.forEach(a => { if (!target(a[1])) bad.push(`ACTS «${a[4]}» → ${a[1]}`); });
  C.forEach(([g, arr]) => arr.forEach(([k, t, act, v]) => { if (!(act === 'tab' ? tabs.has(v) : target(act))) bad.push(`CATALOG ${k} → ${act}${v ? ' ' + v : ''}`); }));
  assert(!bad.length, bad.length + ' dead destinations: ' + list(bad));
});

test('every catalogue entry has a help text, and every draft-enabled form function exists', () => {
  const C = P.literal('CATALOG'), H = P.literal('HELP'), D = P.literal('DRAFT_FNS');
  const noHelp = C.flatMap(([, arr]) => arr.map(x => x[0])).filter(k => !H[k] || !H[k][1]); assert(!noHelp.length, 'no help text: ' + list(noHelp));
  const decl = new Set(P.fns.filter(f => f.kind === 'function').map(f => f.name)); const noFn = D.filter(n => !decl.has(n));
  assert(!noFn.length, 'drafts silently disabled for missing functions: ' + list(noFn));
});

run(__filename);
