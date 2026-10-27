// Reza Desk test helpers — no dependencies beyond Node's standard library and Playwright.
// Synthetic data only. Every network call outside the local server is blocked or intercepted.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');

const ROOT = process.env.MIZ_ROOT || path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp' };

// Tiny static server for the repository root (what GitHub Pages serves). Missing files → 404 (like Pages).
function serve(root = ROOT) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('not found'); }
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(r);
    });
    srv.listen(0, '127.0.0.1', () => res({ url: `http://127.0.0.1:${srv.address().port}/`, close: () => srv.close() }));
  });
}

// Launch a phone-sized browser with its own throw-away profile.
async function launch({ sw = false, offline = false, profile } = {}) {
  const dir = profile || fs.mkdtempSync(path.join(os.tmpdir(), 'miz-test-'));
  const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: 390, height: 844 }, locale: 'fa-IR', serviceWorkers: sw ? 'allow' : 'block' });
  const net = { external: [] };
  // Nothing may leave the machine: fonts are stubbed, every other external host is recorded and blocked.
  await ctx.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href), r => {
    const u = r.request().url();
    if (u.startsWith('https://fonts.googleapis.com')) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
    net.external.push(r.request().method() + ' ' + u.split('?')[0]); return r.abort();
  });
  if (offline) await ctx.setOffline(true);
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  return { ctx, page, errors, net, profile: dir };
}

// Open the app and wait until data is loaded and the first view is drawn (no fixed sleeps).
async function openApp(o, url) {
  await o.page.goto(url);
  await o.page.evaluate(() => { localStorage.setItem('miz.onb', 'x'); localStorage.setItem('miz.seenVer', APP_VER); sessionStorage.setItem('mizSpl', '1'); });
  await o.page.reload(); await ready(o.page);
}
const ready = (p, timeout = 15000) => p.waitForFunction(() => typeof LOAD_OK !== 'undefined' && LOAD_OK && document.getElementById('view') && document.getElementById('view').children.length > 0, null, { timeout });

// Open a document form and wait for it.
async function openDoc(p, d) { await p.evaluate(d => { closeSheet(); formDoc(d); }, d); await p.waitForSelector('#sheetRoot form[data-form=doc]'); }
// Submit the top form and wait until the data version changes (the save went through).
async function submit(p) {
  const v0 = await p.evaluate(() => window._dv || 0);
  await p.evaluate(() => { const f = [...document.querySelectorAll('#sheetRoot form')].pop(); (f.querySelector('button[type=submit]') || [...f.querySelectorAll('button.pri:not([type=button])')].pop()).click(); });
  await p.waitForFunction(v0 => (window._dv || 0) > v0, v0, { timeout: 8000 });
  await p.waitForFunction(() => !document.querySelector('#sheetRoot form[data-form=doc]') || document.getElementById('sheetRoot').hidden, null, { timeout: 8000 }).catch(() => {});
}
// Accounting fingerprint: live rows per collection, GL balance per account, person balances.
const sig = p => p.evaluate(() => { const B = balancesByAcc(autoEntries(), 'تومان');
  return JSON.stringify({ rows: Object.fromEntries(COLS.map(c => [c, S[c].filter(x => !x.void).length]).filter(x => x[1])),
    gl: Object.fromEntries(Object.entries(B).map(([k, r]) => [k, Math.round(r.dr - r.cr)])), pb: personBal() }); });

// Synthetic people + one purchase lot.
async function seedSmall(p) {
  await p.evaluate(async () => { for (const [id, name] of [['p_a', 'مشتری آزمون'], ['p_b', 'فروشندهٔ آزمون']]) await putRaw('people', { id, name, created: nowTs(), updated: nowTs() }); render(); });
  await openDoc(p, { type: 'purchase', personId: 'p_b', date: '2026-10-01', led: 'payable', items: [{ desc: 'عسل آزمون', qty: 100, unit: 'کیلو', price: 0.5e6 }] });
  await submit(p);
  return p.evaluate(() => S.lots.find(l => !l.void).id);
}

// Minimal test runner: test(name, fn) → prints ✓/✗, returns failures.
const T = []; const test = (name, fn, opt = {}) => T.push({ name, fn, ...opt });
async function run(file) {
  let fail = 0, known = 0;
  for (const t of T) { const t0 = Date.now();
    try { await t.fn(); console.log(`  ✓ ${t.name} (${Date.now() - t0} ms)`); }
    catch (e) { if (t.known) { known++; console.log(`  ~ ${t.name} — known issue: ${e.message.split('\n')[0]}`); } else { fail++; console.log(`  ✗ ${t.name}\n      ${e.message.split('\n')[0]}`); } } }
  console.log(`${path.basename(file)}: ${T.length - fail - known} passed, ${fail} failed, ${known} known`); process.exitCode = fail ? 1 : 0;
}
const assert = (c, m) => { if (!c) throw new Error(m); };
module.exports = { ROOT, serve, launch, openApp, ready, openDoc, submit, sig, seedSmall, test, run, assert };
