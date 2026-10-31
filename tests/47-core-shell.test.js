// index.html and its parts (every file in sw.js PARTS: js/core.js, js/engine.js, js/backup.js) always travel together: the start-up
// guard refuses to run without matching parts (data left untouched, recovery screen), the service worker installs only a matching
// set, and a newer index.html is stored (navigation refresh in the worker, stashLatest in the page) only together with all its own
// parts. Generic over PARTS, so a new part is covered automatically. Synthetic data; local server only.
const http = require('http'), fs = require('fs'), path = require('path');
const { ROOT, launch, openApp, ready, tempProfile, test, run, assert } = require('./lib');
const APP = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const PARTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/const PARTS=(\{[^}]*\})/)[1].replace(/'/g, '"'));
const SRC = Object.fromEntries(Object.keys(PARTS).map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
const V0 = (APP.match(/const APP_VER='([\d.]+)';/) || [])[1];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp' };
// st.index: version served for index.html; st.v[file]: version served for a part (unset = as on disk); st.gone[file]: answer 404
function server() { const st = { index: null, v: {}, gone: {} };
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const send = (t, b) => { r.writeHead(200, { 'Content-Type': t, 'Cache-Control': 'no-store' }); r.end(b); }; const f = p.slice(1);
    if (PARTS[f]) { if (st.gone[f]) { r.writeHead(404); return r.end('not found'); } const k = PARTS[f]; return send(TYPES['.js'], st.v[f] ? SRC[f].replace(`${k}='${V0}'`, `${k}='${st.v[f]}'`) : SRC[f]); }
    if (p === '/index.html') return send(TYPES['.html'], st.index ? APP.replace(`APP_VER='${V0}'`, `APP_VER='${st.index}'`) : APP);
    const fp = path.join(ROOT, p); if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end('not found'); }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r); });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res({ st, url: `http://127.0.0.1:${srv.address().port}/`, close: () => new Promise(c => srv.close(c)) }))); }
const allTo = (s, v) => { for (const f of Object.keys(PARTS)) { if (v) s.st.v[f] = v; else delete s.st.v[f]; } };
async function until(p, fn, arg, timeout = 10000, what = 'condition') { const t0 = Date.now();
  for (;;) { if (await p.evaluate(fn, arg).catch(() => false)) return; if (Date.now() - t0 > timeout) throw new Error('timed out waiting for ' + what); await p.waitForTimeout(100); } }
// every cache: version of its index.html and of each part ('-' = not stored)
const pairs = p => p.evaluate(async PARTS => { const out = {}; const v = (t, n) => ((t || '').match(new RegExp('const ' + n + "='([\\d.]+)';")) || [])[1] || '';
  for (const k of await caches.keys()) { if (!/^miz-(kar-v|shell)/.test(k)) continue; const c = await caches.open(k); const i = await c.match('index.html'); const x = { index: i ? v(await i.text(), 'APP_VER') : '-' };
    for (const [f, n] of Object.entries(PARTS)) { const h = await c.match(f); x[f] = h ? v(await h.text(), n) : '-'; } out[k] = x; } return out; }, PARTS);
const mixed = P => Object.entries(P).filter(([, x]) => x.index !== '-' && Object.keys(PARTS).some(f => x[f] !== x.index)).map(([k, x]) => k + ': ' + JSON.stringify(x));
const whole = (x, v) => x.index === v && Object.keys(PARTS).every(f => x[f] === v);

test('guard: any part missing or of another version → recovery screen naming it, the app does not start, the data on the phone is untouched', async () => {
  const s = await server(); const o = await launch(); const p = o.page; await openApp(o, s.url);
  await p.evaluate(async () => { const n = nowTs(); await putRaw('people', { id: 'g1', name: 'شخص نگهبان آزمون', created: n, updated: n }); });
  for (const f of Object.keys(PARTS)) for (const [what, set] of [['missing', () => { s.st.gone[f] = true; }], ['other version', () => { delete s.st.gone[f]; s.st.v[f] = '0.1'; }]]) {
    set(); o.errors.length = 0; await p.reload(); await p.waitForSelector('#bootFail', { timeout: 8000 });
    const r = await p.evaluate(() => ({ why: window.MIZ_BOOT_FAIL, view: (document.getElementById('view') || {}).children ? document.getElementById('view').children.length : -1, load: (() => { try { return LOAD_OK; } catch (_) { return 'never-set'; } })(), btn: !!document.getElementById('bfReload') && !!document.getElementById('bfClean') }));
    assert(r.why && r.btn && r.load === 'never-set' && r.view === 0, `${f} ${what}: ` + JSON.stringify(r));
    assert(what !== 'missing' || r.why.includes(f), `${f} missing: the recovery screen does not name it: ${r.why}`);
    assert(o.errors.some(e => e.includes('miz-core')), `${f} ${what}: the main script was not stopped by the guard: ` + o.errors.join(' | '));
    delete s.st.v[f];
  }
  await p.click('#bfReload'); await ready(p);
  assert(await p.evaluate(() => !!byId('people', 'g1') && !document.getElementById('bootFail')), 'after the reload the app or its data is not back');
  await o.ctx.close(); await s.close();
});

test('install: the worker activates only with a matching index.html + parts set; a broken or mismatched part never replaces the working cache', async () => {
  const s = await server(); const o = await launch({ sw: true, profile: tempProfile('miz-test-') }); const p = o.page; let first = true;
  for (const f of Object.keys(PARTS)) { s.st.v[f] = '0.1'; if (first) await p.goto(s.url); else await p.reload(); first = false; await p.waitForTimeout(2500);
    const ks = await p.evaluate(() => caches.keys()); assert(!ks.some(k => /^miz-kar-v/.test(k)), `mismatched ${f} was installed: ` + JSON.stringify(ks)); delete s.st.v[f]; }
  await p.reload(); await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await ready(p);
  await until(p, async () => (await caches.keys()).some(k => /^miz-kar-v/.test(k)), null, 8000, 'the install');
  const P = await pairs(p); const vk = Object.keys(P).find(k => /^miz-kar-v/.test(k));
  assert(whole(P[vk], V0) && !mixed(P).length, 'installed: ' + JSON.stringify(P));
  await o.ctx.setOffline(true); await p.goto(s.url).catch(() => {}); assert(await ready(p, 8000).then(() => true).catch(() => false), 'installed app does not open offline');
  await o.ctx.setOffline(false); await o.ctx.close(); await s.close();
});

test('navigation refresh and stashLatest: a newer index.html is stored only with all its own parts; never next to a stale one; offline still opens', async () => {
  const s = await server(); const o = await launch({ sw: true, profile: tempProfile('miz-test-') }); const p = o.page; await openApp(o, s.url);
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await ready(p); await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await until(p, async () => !!(await (await caches.open('miz-shell')).match('js/core.js')), null, 6000, 'miz-shell to hold the set');
  const NEXT = V0.replace(/\d+$/, d => String(Number(d) + 1)); let P;
  // half-published: new index.html, and each part in turn still old while the others are new
  s.st.index = NEXT;
  for (const stale of Object.keys(PARTS)) { allTo(s, NEXT); delete s.st.v[stale]; await p.reload().catch(() => {}); await p.waitForTimeout(1500);
    const st1 = await p.evaluate(v => stashLatest(v), NEXT); P = await pairs(p);
    assert(!st1 && !mixed(P).length && Object.values(P).every(x => x.index === V0 || x.index === '-'), `stored a new index.html with a stale ${stale}: ` + JSON.stringify({ st1, P })); }
  // fully published
  allTo(s, NEXT); await p.reload().catch(() => {}); await p.waitForTimeout(1500);
  P = await pairs(p); assert(!mixed(P).length && Object.values(P).some(x => whole(x, NEXT)), 'navigation refresh did not keep the new set: ' + JSON.stringify(P));
  const st2 = await p.evaluate(v => stashLatest(v), NEXT); P = await pairs(p);
  assert(st2 && !mixed(P).length && Object.values(P).filter(x => x.index !== '-').every(x => x.index === NEXT), 'stashLatest: ' + JSON.stringify({ st2, P }));
  // an older index.html from the network is never stored over a newer set
  s.st.index = null; allTo(s, null); await p.reload().catch(() => {}); await p.waitForTimeout(1500); const P2 = await pairs(p);
  assert(!mixed(P2).length && JSON.stringify(P2) === JSON.stringify(P), 'an older shell replaced a newer one: ' + JSON.stringify(P2));
  s.st.index = NEXT; allTo(s, NEXT);
  await o.ctx.setOffline(true); await p.goto(s.url).catch(() => {}); const ok = await ready(p, 8000).then(() => true).catch(() => false);
  const v = ok ? await p.evaluate(() => [APP_VER, CORE_VER, ENGINE_VER, BACKUP_VER, !document.getElementById('bootFail')]) : null;
  assert(ok && v.slice(0, 4).every(x => x === v[0]) && v[4], 'offline after the update: ' + JSON.stringify(v));
  await o.ctx.setOffline(false); await o.ctx.close(); await s.close();
});

run(__filename);
