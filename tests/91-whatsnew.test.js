// «تازه‌ها» (what's new): every «امتحان کن» button opens exactly the page its item names; items without a destination
// are shown as information only, never as a dead button. Synthetic, empty device.
const { serve, launch, openApp, test, run, assert } = require('./lib');
let srv, o;
const wait = ms => new Promise(r => setTimeout(r, ms));
// What is on screen after a navigation: tab, money sub-tab, the top sheet's heading, a new window.
// Polls instead of a fixed wait. Done when two snapshots 60 ms apart are identical and a destination is on screen
// (a sheet other than the «تازه‌ها» pages, another tab, or a new window); otherwise waits at least 1 s (some pages, e.g.
// «بررسی سلامت داده‌ها», take 100–200 ms to open; the earlier 200 ms limit reported the source page now and then),
// because wnGo switches tabs after 150 ms. Gives up waiting for stability after 3 s.
const SOURCE = /^(تازه‌ها و بخش‌های نرفته|تازه‌های میز کار|تازه‌ها و ناشناخته‌ها)/;
async function where(p, w0) { const snap = async () => { const s = await p.evaluate(() => { const r = document.getElementById('sheetRoot'); const hs = r.hidden ? [] : [...r.querySelectorAll('h3,h4')];
    return { tab, ms: ui.ms, biz: ui.biz, open: !r.hidden, h: hs.length ? hs[hs.length - 1].textContent.trim() : '' }; }); s.win = o.ctx.pages().length > w0; return s; };
  // still on «تازه‌ها» after 1 s: an async destination (e.g. syOpen loads first) gets up to 3 s under load
  const t0 = Date.now(); let last = await snap(), s;
  for (;;) { await p.waitForTimeout(60); s = await snap(); const dt = Date.now() - t0, there = s.win || s.tab !== 'home' || (s.open && s.h && !SOURCE.test(s.h));
    if (JSON.stringify(s) === JSON.stringify(last) && (there || (dt >= 1000 && !(s.open && SOURCE.test(s.h))))) break; if (dt > 3000) break; last = s; }
  for (const x of o.ctx.pages().slice(w0)) await x.close().catch(() => {}); return s; }
const reset = p => p.evaluate(async () => { closeSheet(); while (typeof SST !== 'undefined' && SST.length) SST.pop(); closeSheet(); goTab('home'); ui.ms = undefined; ui.biz = undefined;
  // wait until the home view is drawn and no sheet is open (was a fixed 200 ms), at most 2 s
  for (let i = 0; i < 100 && !(document.getElementById('sheetRoot').hidden && tab === 'home'); i++) await new Promise(r => setTimeout(r, 20));
  await new Promise(r => requestAnimationFrame(() => r())); });

test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); });

let info, where1 = {}, checked = 0; const CHUNK = 12, NCHUNK = 8;
test('changes page: every actionable item shown has a «امتحان کن» button, and only those', async () => {
  const p = o.page;
  info = await p.evaluate(() => { const all = WHATS_NEW.flatMap(([v, a]) => a.map(x => x[4])); const areas = [...new Set(WHATS_NEW.flatMap(([, a]) => a.map(x => x[0])))];
    return { act: [...new Set(all.filter(g => wnOk(g)))], areas }; });
  assert(info.act.length >= 30, 'only ' + info.act.length + ' actionable destinations');
  // find each destination's real button on the changes page (all areas)
  for (const a of ['all', ...info.areas]) { const vs = await p.evaluate(a => { closeSheet(); changesSheet(a); return [...document.querySelectorAll('#sheetRoot [data-act=wnGo]')].map(b => b.dataset.v); }, a);
    vs.forEach(v => { if (!where1[v]) where1[v] = a; }); }
  // the changes page lists the newest 80 items per area; older destinations are still checked through the same handler
  const shown = await p.evaluate(areas => { const it = WHATS_NEW.flatMap(([v, a]) => a); const s = new Set(); for (const ar of ['all', ...areas]) it.filter(x => ar === 'all' || x[0] === ar).slice(0, 80).forEach(x => { if (wnOk(x[4])) s.add(x[4]); }); return [...s]; }, info.areas);
  const missing = shown.filter(g => !where1[g]); assert(!missing.length, 'no button shown for: ' + missing.join(', '));
  const dead = Object.keys(where1).filter(g => !info.act.includes(g)); assert(!dead.length, 'button for a non-actionable item: ' + dead.join(', '));
  assert(info.act.length <= CHUNK * NCHUNK, 'raise NCHUNK');
});

for (let c = 0; c < NCHUNK; c++) test(`each destination opens exactly its named page (group ${c + 1})`, async () => {
  const p = o.page, bad = [];
  for (const g of info.act.slice(c * CHUNK, (c + 1) * CHUNK)) {
    const e0 = o.errors.length; checked++;
    // 1) the real button (or, for items older than the page shows, the same handler)
    await reset(p); await p.evaluate(a => changesSheet(a), where1[g] || 'all'); let w0 = o.ctx.pages().length;
    if (where1[g]) await p.click(`#sheetRoot [data-act=wnGo][data-v="${g}"]`);
    else await p.evaluate(g => { const b = document.createElement('button'); b.dataset.act = 'wnGo'; b.dataset.v = g; document.getElementById('sheetRoot').appendChild(b); b.click(); b.remove(); }, g);
    const got = await where(p, w0);
    // 2) the named destination, opened directly
    const [x, y, ...kv] = g.split('|'); let ok;
    if (x === 'tab') { const T = y === 'biz' || y === 'stock' ? 'money' : y;
      ok = got.tab === T && !got.open && (T !== 'money' || y === 'money' || got.ms === 'stock') && kv.every(s => { const [k, v] = s.split(':'); return got[k] === v || (k === 'ms' && got.ms === v); });
      if (!ok) bad.push(`${g}: expected tab ${T}${kv.length ? ' ' + kv.join(',') : ''}, got ${JSON.stringify(got)}`); }
    else { await reset(p); w0 = o.ctx.pages().length;
      await p.evaluate(x => { if (x === 'new') { formLedger({}); return; } const b = document.createElement('button'); b.dataset.act = x; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); }, x);
      const exp = await where(p, w0); ok = (exp.win && got.win) || (exp.open && got.open && exp.h && exp.h === got.h);
      if (!ok) bad.push(`${g}: direct ${JSON.stringify(exp)} vs from «تازه‌ها» ${JSON.stringify(got)}`); }
    if (o.errors.length > e0) bad.push(`${g}: page error ${o.errors.slice(e0).join(' | ').slice(0, 120)}`);
  }
  assert(!bad.length, bad.length + ' wrong: ' + bad.join(' ; '));
});

test('every actionable destination was checked', async () => { assert(checked === info.act.length, checked + ' of ' + info.act.length); });

test('pop-up «تازه‌های میز کار»: actionable cards have a button that works; the others say «فقط برای اطلاع» and have no button', async () => {
  const p = o.page; await reset(p);
  const r = await p.evaluate(() => { localStorage.setItem('miz.seenVer', '4.20'); whatsNew(true);
    return [...document.querySelectorAll('#wnRail .wn-card')].map(c => ({ t: c.querySelector('b').textContent, b: (c.querySelector('[data-act=wnGo]') || {}).dataset?.v || null, info: !!c.querySelector('.wn-info') })); });
  assert(r.length >= 5, 'too few cards: ' + r.length);
  const wrong = r.filter(c => (c.b === null) === !c.info || c.b === 'undefined'); assert(!wrong.length, 'card neither actionable nor labelled: ' + JSON.stringify(wrong));
  // The pop-up shows the 7 newest items, so the cards are picked by kind, not by title (the Help item's destination is checked on the changes page above).
  const act = r.find(c => c.b), info = r.find(c => c.info); assert(act && info, 'expected one actionable and one informational card: ' + JSON.stringify(r));
  // the first actionable card really goes where it says
  await p.click(`#wnRail [data-act=wnGo][data-v="${act.b}"]`); const s = await where(p, o.ctx.pages().length); const [x, y] = act.b.split('|');
  assert(x === 'tab' ? s.tab === y && !s.open : s.open && s.h && !/^تازه‌ها/.test(s.h), `card «${act.t}» → ${act.b} opened: ` + JSON.stringify(s));
  assert(!o.errors.length, o.errors.join(' | '));
});

test('close', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
