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
  nomarkerpure: APP.replace(DECL, ''),                     // the real page with only its version declaration removed, nothing added
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp' };
function shellServer() {
  const st = { mode: 'normal', sw: null, hits: 0, fail: null, swHits: 0, failHits: 0 };   // fail = {path, how:'404'|'drop'} for one non-shell file          // hits = shell requests answered in a non-normal mode
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); const isShell = p === '/' || p === '/index.html';
    if (isShell && st.mode !== 'normal') {
      st.hits++;
      if (st.mode === 'drop') return q.socket.destroy();
      if (st.mode === 'missing') { r.writeHead(404, { 'Content-Type': 'text/html' }); return r.end('<h1>404</h1>'); }
      if (st.mode === 'error') { r.writeHead(500, { 'Content-Type': 'text/html' }); return r.end('<h1>500</h1>'); }
      r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return r.end(PAGES[st.mode]);
    }
    if (st.fail && p === st.fail.path) { st.failHits++; if (st.fail.how === 'drop') return q.socket.destroy(); r.writeHead(404); return r.end('not found'); }
    if (p.endsWith('/')) p += 'index.html';
    if (p === '/sw.js') st.swHits++;
    if (p === '/sw.js' && st.sw) { r.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); return r.end(st.sw); }
    const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('not found'); }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(r);
  });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res({ st, url: `http://127.0.0.1:${srv.address().port}/`, close: () => new Promise(c => srv.close(c)) })));
}

// ---------- helpers ----------
// Playwright's waitForFunction does not await an async predicate (a returned Promise counts as truthy), so async
// conditions (Cache Storage, service-worker registration) are polled with page.evaluate instead.
async function until(p, fn, arg, timeout = 10000, what = 'condition') { const t0 = Date.now();
  for (;;) { if (await p.evaluate(fn, arg).catch(() => false)) return; if (Date.now() - t0 > timeout) throw new Error('timed out waiting for ' + what); await p.waitForTimeout(100); } }
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
  await until(o.page, async () => !!(await (await caches.open('miz-shell')).match('index.html')), null, 5000, 'miz-shell to hold index.html');
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
for (const [mode, label] of [['portal', 'an unrelated HTML page (HTTP 200, e.g. a Wi-Fi sign-in page)'], ['nomarker', `app-like HTML without the version marker «${MARK}»`],
  ['nomarkerpure', 'the real index.html with only its APP_VER declaration removed (no other change)']]) {
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

// ---------- 3b: authentic positive control — the real, unmodified repository index.html is accepted byte-for-byte ----------
test('the real, unmodified index.html is accepted into both shell caches byte-for-byte', async () => {
  const env = await installed();
  await env.o.page.evaluate(async () => { for (const k of await caches.keys()) { const c = await caches.open(k); for (const q of await c.keys()) if (/\/(index\.html)?$/.test(new URL(q.url).pathname)) await c.delete(q); } });
  await env.o.page.goto(env.s.url); await ready(env.o.page);
  await until(env.o.page, async () => !!(await (await caches.open('miz-shell')).match('index.html')), null, 5000, 'miz-shell to hold index.html');
  const got = await env.o.page.evaluate(async () => { const out = {}; for (const k of await caches.keys()) { const r = await (await caches.open(k)).match('index.html'); if (r) out[k] = await r.text(); } return out; });
  const off = await opensOffline(env); await done(env);
  const same = Object.entries(got).filter(([, t]) => t === APP).map(([k]) => k);
  assert(same.includes('miz-shell') && same.some(k => k.startsWith('miz-kar-v')) && !off, `byte-identical copies in: ${JSON.stringify(same)} · ${off}`);
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
  await until(env.o.page, async () => !!(await caches.match('index.html?fresh=1')), null, 3000, 'the fetched page to be cached').catch(() => {});   // absent once fixed
  env.s.st.mode = 'normal';
  const after = await settleShell(env.o.page, {}); const off = await opensOffline(env); await done(env);
  const b = bad(after); assert(!b.length && !off, [b.length ? 'non-app HTML stored under a shell key: ' + b.join('; ') : '', off].filter(Boolean).join(' · '));
});

// ---------- O3: an incomplete or invalid install must not activate or remove the last working cache ----------
// Publish a new worker version and let the browser try to install it; returns once the attempt is over.
async function tryUpgrade(env, tag, until1) {
  const p = env.o.page, sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); const NEW = 'miz-kar-v0.0-' + tag;
  const old = await p.evaluate(async () => (await caches.keys()).find(k => /^miz-kar-v\d/.test(k)));
  const oldEntries = await p.evaluate(async k => (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname).sort(), old);
  env.s.st.sw = sw.replace(/const V='miz-kar-v[^']+'/, `const V='${NEW}'`); const h0 = env.s.st.swHits;
  await p.evaluate(async () => { try { await (await navigator.serviceWorker.getRegistration()).update(); } catch (_) {} });
  for (let t = 0; env.s.st.swHits === h0 || !until1(); t++) { assert(t < 150, 'the new worker never requested its files'); await p.waitForTimeout(100); }
  await until(p, async () => { const r = await navigator.serviceWorker.getRegistration(); return !r.installing && !r.waiting; }, null, 15000, 'the install attempt to finish');
  await p.waitForTimeout(300);
  const keys = await p.evaluate(() => caches.keys());
  const kept = keys.includes(old) ? await p.evaluate(async k => (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname).sort(), old) : [];
  return { NEW, old, oldEntries, keys, kept };
}
const rejected = (u, what) => [
  u.keys.includes(u.NEW) ? `new cache ${u.NEW} exists (${what})` : '',
  !u.keys.includes(u.old) ? `last working cache ${u.old} was deleted (${what})` : '',
  u.keys.includes(u.old) && JSON.stringify(u.kept) !== JSON.stringify(u.oldEntries) ? `last working cache changed: ${JSON.stringify(u.oldEntries)} → ${JSON.stringify(u.kept)}` : ''].filter(Boolean);

test('installing a new worker version while the network returns a non-app page: install refused, last working app kept', async () => {
  const env = await installed(); env.s.st.mode = 'portal';
  const u = await tryUpgrade(env, 'o3portal', () => env.s.st.hits >= 1);
  env.s.st.mode = 'normal'; const after = await shellEntries(env.o.page); const off = await opensOffline(env); await done(env);
  const b = bad(after); const r = rejected(u, 'portal shell');
  assert(!b.length && !r.length && !off, [b.length ? 'non-app HTML stored as shell during install: ' + b.join('; ') : '', ...r, off].filter(Boolean).join(' · '));
});

for (const [file, how] of [['/logo.webp', '404'], ['/qr.js', 'drop']]) {
  test(`a new version whose ${file} download fails (${how}) does not activate; the last working app stays complete and opens offline`, async () => {
    const env = await installed(); env.s.st.fail = { path: file, how };
    const u = await tryUpgrade(env, 'o3' + how, () => env.s.st.failHits >= 1);
    env.s.st.fail = null; const off = await opensOffline(env); await done(env);
    const r = rejected(u, file + ' ' + how); assert(!r.length && !off, [...r, off].filter(Boolean).join(' · '));
  });
}

// ---------- upgrade from a phone whose caches were poisoned before the fix ----------
test('upgrade from previously poisoned caches: once the new worker is active, airplane mode opens the app (not the old poisoned page)', async () => {
  const env = await installed(); const p = env.o.page;
  // what the current code allows: an unrelated page stored as 'index.html' in every shell cache and as './' in the versioned one
  await p.evaluate(async page => { const mk = () => new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    for (const k of await caches.keys()) { if (!/^miz-(kar-v|shell)/.test(k)) continue; const c = await caches.open(k); await c.put('index.html', mk()); if (k.startsWith('miz-kar-v')) await c.put('./', mk()); } }, PAGES.portal);
  // a new version is published and installed (good network), without any page navigation in between
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); env.s.st.sw = sw.replace(/const V='miz-kar-v[^']+'/, "const V='miz-kar-v0.0-o2upgrade'");
  await p.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await until(p, async () => { const r = await navigator.serviceWorker.getRegistration(); const ks = await caches.keys();
    return ks.includes('miz-kar-v0.0-o2upgrade') && !ks.some(k => /^miz-kar-v\d/.test(k) && k !== 'miz-kar-v0.0-o2upgrade') && !r.installing && !r.waiting; }, null, 15000, 'the new worker to install and activate (old versioned cache deleted)');
  const order = await p.evaluate(async () => caches.keys()); const entries = await shellEntries(p);
  const off = await opensOffline(env); await done(env);
  assert(!off, `${off} · cache order: ${JSON.stringify(order)} · shell entries: ${JSON.stringify(entries)}`);
});

run(__filename);
