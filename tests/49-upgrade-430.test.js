// The real upgrade path, locally: the published 4.30 (git 25163ab) is installed with its service worker and synthetic data,
// then the server switches to this version. 4.30's own update code (stashLatest stores only index.html) runs first, the new
// worker installs, and the app must open — online and in airplane mode — with the data intact. Also the worst window:
// 4.30 has stored the new index.html but the new worker is not installed yet, and the phone goes offline.
// Needs git (to export 4.30); skipped when the export is not possible.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execSync } = require('child_process');
const { ROOT, launch, openApp, ready, tempProfile, test, run, assert } = require('./lib');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp' };
let OLD = '';
try { OLD = fs.mkdtempSync(path.join(os.tmpdir(), 'miz-old-')); execSync(`git -C "${ROOT}" archive 25163ab | tar -x -C "${OLD}"`, { stdio: 'ignore' }); } catch (_) { OLD = ''; }
// st.root: files served (OLD or ROOT); st.sw: where sw.js comes from (lets the old worker stay while the new files are out)
function server() { const st = { root: OLD, sw: OLD };
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const base = p === '/sw.js' ? st.sw : st.root, f = path.join(base, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('not found'); }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    // the Google Fonts links are left out: here the worker's font requests escape the test browser's blocking and hang on the
    // sandbox network, which stalls navigation (seen with and without A1); the app itself is served unchanged otherwise
    if (f.endsWith('.html')) return r.end(fs.readFileSync(f, 'utf8').replace(/<link[^>]*fonts\.(googleapis|gstatic)[^>]*>/g, ''));
    fs.createReadStream(f).pipe(r); });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res({ st, url: `http://127.0.0.1:${srv.address().port}/`, close: () => new Promise(c => srv.close(c)) }))); }
async function until(p, fn, arg, timeout = 15000, what = 'condition') { const t0 = Date.now();
  for (;;) { if (await p.evaluate(fn, arg).catch(() => false)) return; if (Date.now() - t0 > timeout) throw new Error('timed out waiting for ' + what); await p.waitForTimeout(150); } }
const NEW = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/const APP_VER='([\d.]+)';/) || [])[1];
async function installed430() {
  const s = await server(); const o = await launch({ sw: true, profile: tempProfile('miz-test-') }); const p = o.page; await openApp(o, s.url);
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await ready(p); await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await until(p, async () => (await caches.keys()).includes('miz-kar-v4.30'), null, 8000, '4.30 cache');
  assert((await p.evaluate(() => APP_VER)) === '4.30', 'not 4.30');
  await p.evaluate(async () => { const n = nowTs(); await putRaw('people', { id: 'u1', name: 'شخص ارتقا آزمون', created: n, updated: n }); await putRaw('tasks', { id: 'u2', title: 'کار ارتقا آزمون', status: 'open', due: today(), created: n, updated: n }); });
  return { s, o, p };
}
const state = p => p.evaluate(() => ({ v: typeof APP_VER !== 'undefined' ? APP_VER : '', fail: window.MIZ_BOOT_FAIL || '', data: !!(typeof byId === 'function' && byId('people', 'u1') && byId('tasks', 'u2')), d: typeof jShort === 'function' ? jShort('2026-10-30') : '' })).catch(e => ({ err: String(e) }));
async function offline(o, url) { await o.ctx.setOffline(true); await o.page.goto(url).catch(() => {}); await o.page.waitForTimeout(1500); const r = await state(o.page); await o.ctx.setOffline(false); return r; }

test('4.30 → this version through 4.30\'s own update button: opens online and in airplane mode, data intact, dates right', async () => {
  if (!OLD) return console.log('    (skipped: git export of 25163ab not available)');
  const { s, o, p } = await installed430();
  s.st.root = ROOT; s.st.sw = ROOT;                                   // the new version is published
  p.evaluate(() => doUpdate()).catch(() => {}); await p.waitForTimeout(3000); await ready(p).catch(() => {});
  let r = await state(p); assert(r.v === NEW && !r.fail && r.data && r.d === '۱۴۰۵/۰۸/۰۸', 'after the update: ' + JSON.stringify(r));
  // the browser activates a waiting worker at the next navigation once nothing holds the old one; the app is reopened
  await p.goto(s.url).catch(() => {}); await p.waitForTimeout(1500); await ready(p).catch(() => {});
  await until(p, async () => { const k = await caches.keys(); return k.some(x => x === 'miz-kar-v' + APP_VER) && !k.includes('miz-kar-v4.30'); }, null, 15000, 'the new worker to take over').catch(async e => { throw new Error(e.message + ' ' + JSON.stringify(await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { k: await caches.keys(), a: r && r.active && r.active.scriptURL, inst: !!(r && r.installing), wait: !!(r && r.waiting) }; }))); });
  r = await offline(o, s.url); assert(r.v === NEW && !r.fail && r.data, 'airplane mode after the update: ' + JSON.stringify(r));
  await o.ctx.close(); await s.close();
});

test('worst window: 4.30 stored the new index.html, the new worker is not installed yet, the phone goes offline → recovery screen (not a blank page), data intact; online again → the app opens', async () => {
  if (!OLD) return console.log('    (skipped)');
  const { s, o, p } = await installed430();
  s.st.root = ROOT;                                                   // new files out, but the browser still has (and is served) the old worker
  const stashed = await p.evaluate(v => stashLatest(v), NEW); assert(stashed, '4.30 stashLatest did not store the new index.html');
  let r = await offline(o, s.url);
  const scr = await p.evaluate(() => !!document.getElementById('bootFail')).catch(() => false);
  assert(r.fail && scr || (r.v === NEW && r.data), 'offline in the window: neither the app nor the recovery screen: ' + JSON.stringify(r));
  const how = r.fail ? 'recovery screen' : 'app';
  s.st.sw = ROOT; await p.goto(s.url); await p.waitForTimeout(1500); await ready(p).catch(() => {});
  r = await state(p); assert(r.v === NEW && !r.fail && r.data, `online again (offline showed: ${how}): ` + JSON.stringify(r));
  console.log('    offline in the window showed: ' + how);
  await o.ctx.close(); await s.close();
});

test('cleanup', () => { try { if (OLD) fs.rmSync(OLD, { recursive: true, force: true }); } catch (_) {} });
run(__filename);
