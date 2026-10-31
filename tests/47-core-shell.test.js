// index.html and its parts (js/core.js, js/engine.js) always travel together: the start-up guard refuses to run without matching
// parts (data left untouched, recovery screen), the service worker installs only a matching set, and a newer index.html is stored
// (navigation refresh in the worker, stashLatest in the page) only together with its own parts. Synthetic data; local server only.
const http = require('http'), fs = require('fs'), path = require('path');
const { ROOT, launch, openApp, ready, tempProfile, test, run, assert } = require('./lib');
const APP = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), CORE = fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8'), ENGINE = fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8');
const V0 = (APP.match(/const APP_VER='([\d.]+)';/) || [])[1];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp' };
// st.index / st.core / st.engine: version served for index.html / js/core.js / js/engine.js (null = as on disk); st.core404 / st.engine404: answer 404
function server() { const st = { index: null, core: null, core404: false, engine: null, engine404: false };
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const send = (t, b) => { r.writeHead(200, { 'Content-Type': t, 'Cache-Control': 'no-store' }); r.end(b); };
    if (p === '/js/core.js') { if (st.core404) { r.writeHead(404); return r.end('not found'); } return send(TYPES['.js'], st.core ? CORE.replace(`CORE_VER='${V0}'`, `CORE_VER='${st.core}'`) : CORE); }
    if (p === '/js/engine.js') { if (st.engine404) { r.writeHead(404); return r.end('not found'); } return send(TYPES['.js'], st.engine ? ENGINE.replace(`ENGINE_VER='${V0}'`, `ENGINE_VER='${st.engine}'`) : ENGINE); }
    if (p === '/index.html') return send(TYPES['.html'], st.index ? APP.replace(`APP_VER='${V0}'`, `APP_VER='${st.index}'`) : APP);
    const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('not found'); }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(r); });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res({ st, url: `http://127.0.0.1:${srv.address().port}/`, close: () => new Promise(c => srv.close(c)) }))); }
async function until(p, fn, arg, timeout = 10000, what = 'condition') { const t0 = Date.now();
  for (;;) { if (await p.evaluate(fn, arg).catch(() => false)) return; if (Date.now() - t0 > timeout) throw new Error('timed out waiting for ' + what); await p.waitForTimeout(100); } }
// every cache: version of its index.html, js/core.js and js/engine.js
const pairs = p => p.evaluate(async () => { const out = {}; for (const k of await caches.keys()) { if (!/^miz-(kar-v|shell)/.test(k)) continue; const c = await caches.open(k);
  const i = await c.match('index.html'), j = await c.match('js/core.js'), g = await c.match('js/engine.js'); const v = (t, n) => ((t || '').match(new RegExp('const ' + n + "='([\\d.]+)';")) || [])[1] || '';
  out[k] = { index: i ? v(await i.text(), 'APP_VER') : '-', core: j ? v(await j.text(), 'CORE_VER') : '-', engine: g ? v(await g.text(), 'ENGINE_VER') : '-' }; } return out; });
const mixed = P => Object.entries(P).filter(([, x]) => x.index !== '-' && (x.index !== x.core || x.index !== x.engine)).map(([k, x]) => `${k}: index ${x.index} + core ${x.core} + engine ${x.engine}`);

test('guard: js/core.js or js/engine.js missing or of another version → recovery screen, the app does not start, the data on the phone is untouched', async () => {
  const s = await server(); const o = await launch(); const p = o.page; await openApp(o, s.url);
  await p.evaluate(async () => { const n = nowTs(); await putRaw('people', { id: 'g1', name: 'شخص نگهبان آزمون', created: n, updated: n }); });
  for (const [what, set] of [['missing', () => { s.st.core404 = true; }], ['other version', () => { s.st.core404 = false; s.st.core = '0.1'; }],
      ['engine missing', () => { s.st.core = null; s.st.engine404 = true; }], ['engine of another version', () => { s.st.engine404 = false; s.st.engine = '0.1'; }]]) {
    set(); o.errors.length = 0; await p.reload(); await p.waitForSelector('#bootFail', { timeout: 8000 });
    const r = await p.evaluate(() => ({ why: window.MIZ_BOOT_FAIL, view: (document.getElementById('view') || {}).children ? document.getElementById('view').children.length : -1, load: (() => { try { return LOAD_OK; } catch (_) { return 'never-set'; } })(), btn: !!document.getElementById('bfReload') && !!document.getElementById('bfClean') }));
    assert(r.why && r.btn && r.load === 'never-set' && r.view === 0, `${what}: ` + JSON.stringify(r));
    assert(o.errors.some(e => e.includes('miz-core')), `${what}: the main script was not stopped by the guard: ` + o.errors.join(' | '));
  }
  s.st.core = null; s.st.engine = null; await p.click('#bfReload'); await ready(p);
  assert(await p.evaluate(() => !!byId('people', 'g1') && !document.getElementById('bootFail')), 'after the reload the app or its data is not back');
  await o.ctx.close(); await s.close();
});

test('install: the worker activates only with a matching index.html + parts set; a broken or mismatched part never replaces the working cache', async () => {
  const s = await server(); const o = await launch({ sw: true, profile: tempProfile('miz-test-') }); const p = o.page;
  s.st.core = '0.1'; await p.goto(s.url); await p.waitForTimeout(2500);
  let ks = await p.evaluate(() => caches.keys()); assert(!ks.some(k => /^miz-kar-v/.test(k)), 'mismatched core was installed: ' + JSON.stringify(ks));
  s.st.core = null; s.st.engine = '0.1'; await p.reload(); await p.waitForTimeout(2500);
  ks = await p.evaluate(() => caches.keys()); assert(!ks.some(k => /^miz-kar-v/.test(k)), 'mismatched engine was installed: ' + JSON.stringify(ks));
  s.st.engine = null; await p.reload(); await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await ready(p);
  await until(p, async () => (await caches.keys()).some(k => /^miz-kar-v/.test(k)), null, 8000, 'the install');
  let P = await pairs(p); const vk = Object.keys(P).find(k => /^miz-kar-v/.test(k));
  assert(P[vk].index === V0 && P[vk].core === V0 && P[vk].engine === V0 && !mixed(P).length, 'installed: ' + JSON.stringify(P));
  await o.ctx.setOffline(true); await p.goto(s.url).catch(() => {}); assert(await ready(p, 8000).then(() => true).catch(() => false), 'installed app does not open offline');
  await o.ctx.setOffline(false); await o.ctx.close(); await s.close();
});

test('navigation refresh and stashLatest: a newer index.html is stored only with its own parts; never next to a stale one; offline still opens', async () => {
  const s = await server(); const o = await launch({ sw: true, profile: tempProfile('miz-test-') }); const p = o.page; await openApp(o, s.url);
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await ready(p); await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await until(p, async () => !!(await (await caches.open('miz-shell')).match('js/core.js')), null, 6000, 'miz-shell to hold the pair');
  const NEXT = V0.replace(/\d+$/, d => String(Number(d) + 1));
  // half-published: new index.html, old js/core.js on the server
  s.st.index = NEXT; await p.reload().catch(() => {}); await p.waitForTimeout(1500);
  const st1 = await p.evaluate(v => stashLatest(v), NEXT);
  let P = await pairs(p); assert(!st1 && !mixed(P).length && Object.values(P).every(x => x.index === V0 || x.index === '-'), 'stored a new index.html with a stale core: ' + JSON.stringify({ st1, P }));
  // half-published: new index.html and js/core.js, old js/engine.js
  s.st.core = NEXT; await p.reload().catch(() => {}); await p.waitForTimeout(1500);
  const st1b = await p.evaluate(v => stashLatest(v), NEXT);
  P = await pairs(p); assert(!st1b && !mixed(P).length && Object.values(P).every(x => x.index === V0 || x.index === '-'), 'stored a new index.html with a stale engine: ' + JSON.stringify({ st1b, P }));
  // fully published: all new
  s.st.engine = NEXT; await p.reload().catch(() => {}); await p.waitForTimeout(1500);
  P = await pairs(p); assert(!mixed(P).length && Object.values(P).some(x => x.index === NEXT && x.core === NEXT && x.engine === NEXT), 'navigation refresh did not keep the new set: ' + JSON.stringify(P));
  const st2 = await p.evaluate(v => stashLatest(v), NEXT); P = await pairs(p);
  assert(st2 && !mixed(P).length && Object.values(P).filter(x => x.index !== '-').every(x => x.index === NEXT), 'stashLatest: ' + JSON.stringify({ st2, P }));
  // an older index.html from the network is never stored over a newer pair
  s.st.index = null; s.st.core = null; s.st.engine = null; await p.reload().catch(() => {}); await p.waitForTimeout(1500); const P2 = await pairs(p);
  assert(!mixed(P2).length && JSON.stringify(P2) === JSON.stringify(P), 'an older shell replaced a newer one: ' + JSON.stringify(P2));
  s.st.index = NEXT; s.st.core = NEXT; s.st.engine = NEXT;
  await o.ctx.setOffline(true); await p.goto(s.url).catch(() => {}); const ok = await ready(p, 8000).then(() => true).catch(() => false);
  const v = ok ? await p.evaluate(() => [APP_VER, CORE_VER, ENGINE_VER, !document.getElementById('bootFail')]) : null;
  assert(ok && v[0] === v[1] && v[0] === v[2] && v[3], 'offline after the update: ' + JSON.stringify(v));
  await o.ctx.setOffline(false); await o.ctx.close(); await s.close();
});

run(__filename);
