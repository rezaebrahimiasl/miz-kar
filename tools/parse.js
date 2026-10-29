// Developer tool (never loaded by the app): a light scanner for the single inline script in index.html.
// It knows strings, template literals (with ${…}), comments and regex literals, so brace matching and
// "what encloses this position" are reliable without a full JavaScript parser. Used by tools/q.js and tests/01-wiring.
'use strict';
const fs = require('fs'), path = require('path');

const REGEX_AFTER = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
const REGEX_KW = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'throw', 'else', 'new', 'instanceof', 'do', 'yield', 'await']);

function load(root = process.env.MIZ_ROOT || path.resolve(__dirname, '..')) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const s = html.indexOf('<script>') + 8, e = html.indexOf('</script>', s);
  if (s < 8 || e < 0) throw new Error('inline <script> not found');
  return build(html, s, html.slice(s, e));
}

// code[i] = 1 where js[i] is real code (not inside a string, template text, comment or regex); depth[i] = brace depth at i
function scan(js) {
  const n = js.length, code = new Uint8Array(n), depth = new Int32Array(n);
  let i = 0, d = 0, prev = '', word = '';
  const tpl = [];                                 // brace depth at which each open ${ … } returns to template text
  const tplText = () => {                          // scan template text from i (just after ` or }) to the closing ` or ${
    while (i < n) { const c = js[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; return; }
      if (c === '$' && js[i + 1] === '{') { code[i + 1] = 1; depth[i + 1] = d; d++; tpl.push(d); i += 2; prev = '{'; word = ''; return; }
      i++; } };
  while (i < n) {
    const c = js[i];
    if (c === '/' && js[i + 1] === '/') { while (i < n && js[i] !== '\n') i++; continue; }
    if (c === '/' && js[i + 1] === '*') { const j = js.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
    if (c === "'" || c === '"') { i++; while (i < n && js[i] !== c) { if (js[i] === '\\') i++; i++; } i++; prev = 'x'; word = ''; continue; }
    if (c === '`') { i++; tplText(); prev = 'x'; word = ''; continue; }
    if (c === '/' && (REGEX_AFTER.has(prev) || prev === '' || REGEX_KW.has(word))) {
      i++; let cls = false; while (i < n) { const r = js[i]; if (r === '\\') { i += 2; continue; } if (r === '[') cls = true; else if (r === ']') cls = false; else if (r === '/' && !cls) break; else if (r === '\n') break; i++; }
      i++; while (i < n && /[a-z]/i.test(js[i])) i++; prev = 'x'; word = ''; continue; }
    code[i] = 1;
    if (c === '{') { depth[i] = d; d++; }
    else if (c === '}') { if (tpl.length && tpl[tpl.length - 1] === d) { tpl.pop(); d--; depth[i] = d; i++; tplText(); prev = 'x'; word = ''; continue; } d--; depth[i] = d; }
    else depth[i] = d;
    if (/\s/.test(c)) { i++; continue; }
    if (/[\w$]/.test(c)) { word = (/[\w$]/.test(prev) ? word : '') + c; prev = c; } else { prev = c; word = ''; }
    i++;
  }
  return { code, depth, end: d };
}

function build(html, off, js) {
  const sc = scan(js);
  const nl = []; for (let i = 0; i < html.length; i++) if (html.charCodeAt(i) === 10) nl.push(i);
  const lineOfHtml = p => { let lo = 0, hi = nl.length; while (lo < hi) { const m = (lo + hi) >> 1; if (nl[m] < p) lo = m + 1; else hi = m; } return lo + 1; };
  const P = { html, off, js, code: sc.code, depth: sc.depth, balanced: sc.end === 0 };
  P.line = i => lineOfHtml(off + i);               // js index → index.html line number
  P.isCode = i => sc.code[i] === 1;
  P.matchClose = i => { const o = js[i], c = { '{': '}', '(': ')', '[': ']' }[o]; let k = 0;
    for (let j = i; j < js.length; j++) { if (!sc.code[j]) continue; if (js[j] === o) k++; else if (js[j] === c && --k === 0) return j; } return -1; };
  P.find = (re, from = 0, to = js.length) => { const out = []; re.lastIndex = 0; const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of js.slice(from, to).matchAll(g)) { const at = from + m.index; if (sc.code[at]) out.push({ at, m }); } return out; };
  P.nextCode = (i, ch) => { for (let j = i; j < js.length; j++) if (sc.code[j] && js[j] === ch) return j; return -1; };
  // top-level statement (depth 0) containing position i
  P.stmt = i => { let s = i, e = i; while (s > 0 && !(sc.code[s - 1] && sc.depth[s - 1] === 0 && (js[s - 1] === ';' || js[s - 1] === '}' ) )) s--;
    while (e < js.length && !(sc.code[e] && sc.depth[e] === 0 && js[e] === ';')) e++; return [s, e]; };

  // if(…X…){ block }: start of the "if" whose condition contains position i, and the end of its block
  P.ifBlock = i => { let k = 0, j = i; for (; j >= 0; j--) { if (!sc.code[j]) continue; if (js[j] === ')') k++; else if (js[j] === '(') { if (k === 0) break; k--; } }
    if (j < 0) return null; const kw = js.slice(Math.max(0, j - 8), j).match(/(?:else\s+)?if\s*$/); const pc = P.matchClose(j), bo = P.nextCode(pc + 1, '{');
    const start = kw ? j - kw[0].length : j; if (bo < 0 || bo - pc > 3) return { start, end: pc + 1 }; return { start, end: P.matchClose(bo) + 1 }; };

  // ---------- functions: declarations and arrow/function constants ----------
  const fns = [];
  for (const { at, m } of P.find(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const po = at + m[0].length - 1, pc = P.matchClose(po), bo = P.nextCode(pc + 1, '{'), bc = bo < 0 ? -1 : P.matchClose(bo);
    if (bc > 0) fns.push({ name: m[1], start: at, end: bc + 1, kind: 'function' }); }
  for (const { at, m } of P.find(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|[A-Za-z_$][\w$]*\s*=>)/g)) {
    let j = at + m[0].length - 1, b;
    if (js[j] === '(') { j = P.matchClose(j); if (j < 0) continue; const arrow = js.slice(j + 1, j + 40).match(/^\s*=>\s*/); if (!arrow) continue; b = j + 1 + arrow[0].length; }
    else { b = at + m[0].length; while (/\s/.test(js[b])) b++; }   // single parameter without parentheses: «x=>…»
    let end;
    if (js[b] === '{') end = P.matchClose(b) + 1;
    else { const d0 = sc.depth[at]; end = b; let k = 0; for (; end < js.length; end++) { if (!sc.code[end]) continue; const c = js[end];
        if ('([{'.includes(c)) k++; else if (')]}'.includes(c)) { if (k === 0) break; k--; } else if ((c === ';' || c === ',' || c === '\n') && k === 0 && sc.depth[end] === d0) break; } }
    if (end > at) fns.push({ name: m[1], start: at, end, kind: 'arrow' }); }
  fns.sort((a, b) => a.start - b.start); P.fns = fns;
  P.fn = name => fns.filter(f => f.name === name);

  // ---------- click actions: the main switch(a) plus a==='X' tests in listeners that read data-act ----------
  const sw = P.find(/switch\(a\)\{/g)[0]; P.cases = [];
  if (sw) { const bo = sw.at + 'switch(a)'.length, bc = P.matchClose(bo), d1 = sc.depth[bo] + 1;
    const cs = P.find(/case\s*'([^']+)'\s*:/g, bo, bc).filter(x => sc.depth[x.at] === d1);
    cs.forEach((x, k) => P.cases.push({ name: x.m[1], start: x.at, end: k + 1 < cs.length ? cs[k + 1].at : bc, kind: 'case' }));
    P.switchRange = [bo, bc]; }
  const isActStmt = s => /dataset\.act|data-act\]|\[data-act/.test(s), isFormStmt = s => /dataset\.form/.test(s);
  P.otherActs = []; for (const { at, m } of P.find(/\ba\s*===\s*'([A-Za-z0-9_]+)'/g)) { if (P.switchRange && at > P.switchRange[0] && at < P.switchRange[1]) continue;
    const [s, e] = P.stmt(at); if (isActStmt(js.slice(s, e))) P.otherActs.push({ name: m[1], start: at, end: at + m[0].length, kind: 'act-test' }); }
  P.handledActs = new Set([...P.cases.map(c => c.name), ...P.otherActs.map(c => c.name)]);

  // ---------- form submit branches: if(F==='x'){…} in listeners that read data-form ----------
  P.forms = [];
  for (const { at, m } of P.find(/\b(?:F|fm|form|k)\s*===\s*'([A-Za-z0-9_]+)'|dataset\.form\s*===\s*'([A-Za-z0-9_]+)'/g)) {
    const [s, e] = P.stmt(at); if (!isFormStmt(js.slice(s, e))) continue;
    const name = m[1] || m[2]; const pc = (() => { let k = 0; for (let j = at; j < js.length; j++) { if (!sc.code[j]) continue; if (js[j] === '(') k++; else if (js[j] === ')') { if (k === 0) return j; k--; } } return -1; })();
    const bo = pc < 0 ? -1 : P.nextCode(pc + 1, '{'); if (bo < 0 || bo - pc > 3) { P.forms.push({ name, start: at, end: at + m[0].length, kind: 'form-test' }); continue; }
    const ib = P.ifBlock(at); P.forms.push({ name, start: ib ? ib.start : at, end: P.matchClose(bo) + 1, kind: 'form' }); }
  P.handledForms = new Set(P.forms.filter(f => f.kind === 'form').map(f => f.name));

  // ---------- what encloses a position: action case > form branch > innermost function > top level ----------
  P.encl = i => { const c = P.cases.find(x => i >= x.start && i < x.end); if (c) return 'act:' + c.name;
    const f = P.forms.filter(x => x.kind === 'form' && i >= x.start && i < x.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0]; if (f) return 'form:' + f.name;
    const g = fns.filter(x => i >= x.start && i < x.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0]; return g ? 'fn:' + g.name : 'top-level L' + P.line(i); };

  // ---------- regions: /* ---------- Title ---------- */ banners ----------
  P.regions = [...html.matchAll(/\/\* ---------- (.+?) ---------- \*\//g)].map(m => ({ title: m[1], line: lineOfHtml(m.index) }));
  P.regions.forEach((r, k) => { r.endLine = k + 1 < P.regions.length ? P.regions[k + 1].line - 1 : lineOfHtml(off + js.length); });

  // ---------- literal data blocks (pure literals: evaluated in a sandbox, no app code runs) ----------
  P.literal = name => { const h = P.find(new RegExp('(?:const|let)\\s+' + name + '\\s*=\\s*'))[0]; if (!h) return undefined;
    const o = h.at + h.m[0].length, c = P.matchClose(o); return require('vm').runInNewContext('(' + js.slice(o, c + 1) + ')', {}, { timeout: 2000 }); };
  return P;
}

// Readable source for js[s..e): line breaks after ; { and before }, indented by brace depth, each line prefixed with its index.html line.
function pretty(P, s, e) {
  const { js } = P, d0 = P.depth[s] || 0, out = []; let cur = '', curLine = P.line(s), dep = 0;
  const flush = () => { if (cur.trim()) out.push(`L${String(curLine).padEnd(5)} ${'  '.repeat(Math.max(0, dep))}${cur.trim()}`); cur = ''; };
  for (let i = s; i < e; i++) { const c = js[i];
    if (c === '\n') { flush(); curLine = P.line(i + 1); dep = (P.depth[i + 1] || d0) - d0; continue; }
    if (!cur.trim()) { curLine = P.line(i); dep = P.depth[i] - d0; }
    if (P.code[i] && c === '}') { flush(); curLine = P.line(i); dep = P.depth[i] - d0; cur = '}'; if (js[i + 1] !== ')' && js[i + 1] !== ',' && js[i + 1] !== ';') flush(); continue; }
    cur += c; if (P.code[i] && (c === '{' || c === ';')) flush(); }
  flush(); return out.join('\n');
}

module.exports = { load, scan, build, pretty };
