// O2 — the offline shell may only ever be the real app. Service worker enabled; synthetic pages; no network beyond 127.0.0.1.
// Each scenario: install the app online (normal server) → switch the server to a misbehaving mode → trigger one shell-saving path
// → inspect every cached shell entry → go to airplane mode and check the app still opens from cache.
const fs = require('fs'), path = require('path'), http = require('http');
const { ROOT, launch, openApp, ready, tempProfile, test, run, assert } = require('./lib');

// ---------- a test server whose answers for the shell (/, /index.html) can be switched ----------
const MARK = "const APP_VER='";                        // as named in the O2 requirement
const DECL = /const APP_VER='\d+(?:\.\d+)*';/;          // the real declaration (a validation regex in the code itself must not count as a marker)
const APP = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const PAGES = {
  portal: '<!doctype html><html><head><meta charset="utf-8"><title>Wi-Fi login</title></head><body><!--SYNTH-PORTAL--><h1>Please sign in to use this network</h1></body></html>',
  nomarker: APP.replace(DECL, "const APP_VERSION_REMOVED_FOR_TEST='0';").replace('</body>', '<!--SYNTH-NOMARKER--></body>'),
  valid: APP.replace('</body>', '<!--SYNTH-NEW-SHELL--></body>'),
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp' };
function shellServer() {
  const st = { mode: 'normal', sw: null, hits: 0 };          // hits = shell requests answered in a non-normal mode
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); const isShell = p === '/' || p === '/index.html';
    if (isShell && st.mode !== 'normal') {
      st.hits++;
      if (st.mode === 'drop') return q.socket.destroy();
      if (st.mode === 'missing') { r.writeHead(404, { 'Content-Type': 'text/html' }); return r.end('<h1>404</h1>'); }
      if (st.mode === 'error') { r.writeHead(500, { 'Content-Type': 'text/html' }); return r.end('<h1>500</h1>'); }
      r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return r.end(PAGES[st.mode]);
    }
    if (p.endsWith('/')) p += 'index.html';
    if (p === '/sw.js' && st.sw) { r.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); return r.end(st.sw); }
    const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('not found'); }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(r);
  });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res({ st, url: `http://127.0.0.1:${srv.address().port}/`, close: () => new Promise(c => srv.close(c)) })));
}

// ---------- helpers ----------
// Every cache entry the service worker can serve as the shell (shellFromCache uses ignoreSearch on 'index.html' and './').
const shellEntries = p => p.evaluate(async src => { const DECL = new RegExp(src); const out = {};
  for (const k of await caches.keys()) { const c = await caches.open(k);
    for (const req of await c.keys()) { const u = new URL(req.url); if (!/\/(index\.html)?$/.test(u.pathname)) continue;
      const t = await (await c.match(req)).text();
      out[`${k} ${u.pathname}${u.search}`] = t.includes('SYNTH-PORTAL') ? 'portal' : t.includes('SYNTH-NOMARKER') ? 'no-marker' : !DECL.test(t) ? 'other-non-app' : t.includes('SYNTH-NEW-SHELL') ? 'app-new' : 'app'; } }
  return out; }, DECL.source);
const bad = e => Object.entries(e).filter(([, v]) => !v.startsWith('app')).map(([k, v]) => `${k} → ${v}`);
// The worker refreshes the shell in the background after answering a navigation; wait up to 3 s for any change to land.
async function settleShell(p, before) { const t0 = Date.now(); let now = before;
  while (Date.now() - t0 < 3000) { now = await shellEntries(p); if (JSON.stringify(now) !== JSON.stringify(before)) { await p.waitForTimeout(200); return shellEntries(p); } await p.waitForTimeout(100); }
  return now; }

// Fresh profile, app installed online and controlled by the worker, both shell caches holding the real app.
async function installed() {
  const s = await shellServer(); const profile = tempProfile('miz-test-');
  const o = await launch({ sw: true, profile }); await openApp(o, s.url);
  await o.page.evaluate(() => navigator.serviceWorker.ready); await o.page.reload(); await ready(o.page);
  await o.page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await o.page.waitForFunction(async () => !!(await (await caches.open('miz-shell')).match('index.html')), null, { timeout: 5000 });
  const e = await shellEntries(o.page); assert(DECL.test(APP), 'app index.html has no version declaration');
  assert(!bad(e).length && Object.keys(e).length >= 2, 'baseline install not clean: ' + JSON.stringify(e));
  return { s, o, profile };
}
// Airplane mode, then a fresh navigation: the app must open from cache.
async function opensOffline(env) {
  await env.o.ctx.setOffline(true); await env.o.page.goto(env.s.url).catch(() => {});
  const ok = await ready(env.o.page, 8000).then(() => true).catch(() => false);
  const title = ok ? '' : await env.o.page.title().catch(() => '?');
  await env.o.ctx.setOffline(false); return ok ? '' : `offline launch did not open the app (page title: «${title}»)`;
}
async function done(env) { await env.o.ctx.close(); await env.s.close(); }

// ---------- 1, 2: navigation refresh must not accept non-app HTML ----------
for (const [mode, label] of [['portal', 'an unrelated HTML page (HTTP 200, e.g. a Wi-Fi sign-in page)'], ['nomarker', `app-like HTML without the version marker «${MARK}»`]]) {
  test(`navigation refresh: ${label} is not accepted as the shell`, async () => {
    const env = await installed(); const before = await shellEntries(env.o.page);
    env.s.st.mode = mode; await env.o.page.goto(env.s.url); await env.o.page.waitForFunction(() => true);
    assert(env.s.st.hits > 0, 'the worker never asked the network for the shell');
    const after = await settleShell(env.o.page, before); env.s.st.mode = 'normal';
    const off = await opensOffline(env); await done(env);
    const b = bad(after); assert(!b.length && !off, [b.length ? 'non-app HTML stored as shell: ' + b.join('; ') : '', off].filter(Boolean).join(' · '));
  });
}

// ---------- 3: a valid new app page is still accepted (positive control: proves the 3 s window sees real updates) ----------
test('navigation refresh: a valid app page (with the marker) is accepted into both shell caches', async () => {
  const env = await installed(); const before = await shellEntries(env.o.page);
  env.s.st.mode = 'valid'; await env.o.page.goto(env.s.url);
  const after = await settleShell(env.o.page, before); env.s.st.mode = 'normal';
  const off = await opensOffline(env); await done(env);
  const fresh = Object.entries(after).filter(([k, v]) => /^(miz-kar-v[\d.]+|miz-shell) \/index\.html$/.test(k) && v === 'app-new');
  assert(fresh.length === 2, 'valid update not stored in both caches: ' + JSON.stringify(after));
  assert(!off, off);
});

// ---------- 4: a missing or failing index.html never replaces the cached shell ----------
for (const mode of ['missing', 'error', 'drop']) {
  test(`navigation refresh: ${mode === 'missing' ? 'HTTP 404' : mode === 'error' ? 'HTTP 500' : 'a dropped connection'} leaves the cached shell intact`, async () => {
    const env = await installed(); const before = await shellEntries(env.o.page);
    env.s.st.mode = mode; await env.o.page.goto(env.s.url).catch(() => {});
    const after = await settleShell(env.o.page, before); env.s.st.mode = 'normal';
    const off = await opensOffline(env); await done(env);
    assert(JSON.stringify(after) === JSON.stringify(before), 'shell entries changed: ' + JSON.stringify(after));
    assert(!off, off);
  });
}

// ---------- 5: stashLatest() in index.html ----------
for (const [mode, v, label] of [['portal', '', 'an unrelated page with an empty version'], ['nomarker', '', 'app-like HTML without the marker, empty version'], ['portal', '9.99', 'an unrelated page with a version given']]) {
  test(`stashLatest('${v}'): rejects ${label}`, async () => {
    const env = await installed(); env.s.st.mode = mode;
    const ret = await env.o.page.evaluate(v => stashLatest(v), v); env.s.st.mode = 'normal';
    const after = await shellEntries(env.o.page); const off = await opensOffline(env); await done(env);
    const b = bad(after); assert(ret === false && !b.length && !off, [ret !== false ? `stashLatest returned ${ret}` : '', b.length ? 'non-app HTML stored as shell: ' + b.join('; ') : '', off].filter(Boolean).join(' · '));
  });
}

// ---------- additional paths found during inspection ----------
test('ordinary fetch of index.html (the request stashLatest makes) does not store non-app HTML where the shell lookup can find it', async () => {
  const env = await installed(); env.s.st.mode = 'portal';
  await env.o.page.evaluate(() => fetch('index.html?fresh=1', { cache: 'no-store' }).then(r => r.text()));
  await env.o.page.waitForFunction(async () => (await caches.keys()).length > 0);
  env.s.st.mode = 'normal';
  const after = await settleShell(env.o.page, {}); const off = await opensOffline(env); await done(env);
  const b = bad(after); assert(!b.length && !off, [b.length ? 'non-app HTML stored under a shell key: ' + b.join('; ') : '', off].filter(Boolean).join(' · '));
});

test('installing a new worker version while the network returns a non-app page does not store it as the shell', async () => {
  const env = await installed(); const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  env.s.st.sw = sw.replace(/const V='miz-kar-v[^']+'/, "const V='miz-kar-v0.0-o2test'"); env.s.st.mode = 'portal';
  await env.o.page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  // wait until the new worker has requested both shell URLs ('./' and 'index.html') and finished writing its cache
  for (let t = 0; env.s.st.hits < 2; t++) { assert(t < 100, 'new worker never fetched the shell'); await env.o.page.waitForTimeout(100); }
  await env.o.page.waitForFunction(async () => { const c = await caches.open('miz-kar-v0.0-o2test'); const r = await navigator.serviceWorker.getRegistration();
    return !r.installing && (await c.keys()).length >= 7; }, null, { timeout: 10000 });
  env.s.st.mode = 'normal';
  const after = await settleShell(env.o.page, {}); const off = await opensOffline(env); await done(env);
  const b = bad(after); assert(!b.length && !off, [b.length ? 'non-app HTML stored as shell during install: ' + b.join('; ') : '', off].filter(Boolean).join(' · '));
});

run(__filename);
