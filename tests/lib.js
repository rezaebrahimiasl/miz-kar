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

// ---- Temporary browser profiles: only directories created here are ever deleted, and only once no browser uses them ----
const TMP = fs.realpathSync(os.tmpdir());
const OWNED = new Map();          // dir → { open: number of live browser contexts, single: delete as soon as its one context closes }
const CONTEXTS = new Set();       // live browser contexts (closed before the forced exit in run())
const OWN_NAME = /^miz-(test|off)-[A-Za-z0-9]{6}$/;
function tempProfile(prefix = 'miz-test-') {   // a profile a test file wants to reuse across several launches
  const dir = fs.mkdtempSync(path.join(TMP, prefix)); OWNED.set(dir, { open: 0, single: false }); return dir;
}
function removeProfile(dir) {     // returns '' when removed, otherwise the reason it was left untouched
  const o = OWNED.get(dir); if (!o) return 'not created by this test run';
  if (o.open > 0) return 'browser still open';
  const real = path.resolve(dir);
  if (path.dirname(real) !== TMP || !OWN_NAME.test(path.basename(real))) return 'outside the test temp area';
  let st; try { st = fs.lstatSync(real); } catch (_) { OWNED.delete(dir); return ''; }
  if (!st.isDirectory() || st.isSymbolicLink()) return 'not a plain directory';
  try { fs.rmSync(real, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (e) { return 'could not remove (' + e.code + ')'; }
  OWNED.delete(dir); return '';
}

// Launch a phone-sized browser with its own throw-away profile.
async function launch({ sw = false, offline = false, profile } = {}) {
  const dir = profile || fs.mkdtempSync(path.join(TMP, 'miz-test-'));
  if (!profile) OWNED.set(dir, { open: 0, single: true });
  const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: 390, height: 844 }, locale: 'fa-IR', serviceWorkers: sw ? 'allow' : 'block' });
  const own = OWNED.get(dir); if (own) own.open++; CONTEXTS.add(ctx);
  // 'close' can fire before the browser process has finished writing its profile, so only the bookkeeping happens here;
  // the profile is removed after ctx.close() has resolved (the browser has exited) or, at the latest, when the file ends.
  let counted = true; const done = () => { if (!counted) return; counted = false; CONTEXTS.delete(ctx); const o = OWNED.get(dir); if (o) o.open--; };
  ctx.on('close', done);
  const close0 = ctx.close.bind(ctx);
  ctx.close = async (...a) => { await close0(...a); done(); const o = OWNED.get(dir); if (o && o.single && o.open === 0) removeProfile(dir); };
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
// A test file that ends without printing its summary (crash, forgotten run(), or nothing left to wait on) must fail.
let reported = false, stray = 0;   // stray = unhandled rejections outside any test
process.on('exit', () => {
  if (!reported) { console.log('  ✗ test file ended before reporting a result'); process.exitCode = 1; }
  const left = []; for (const dir of [...OWNED.keys()]) { const why = removeProfile(dir); if (why) left.push(`${dir} (${why})`); }
  if (left.length) console.log('  ! temporary profile left untouched: ' + left.join(', '));
});
process.on('unhandledRejection', e => { stray++; console.log('  ✗ unhandled rejection: ' + String(e && e.message || e).split('\n')[0]); process.exitCode = 1; });
const T = []; const test = (name, fn, opt = {}) => T.push({ name, fn, ...opt });
async function run(file) {
  let fail = 0, known = 0;
  for (const t of T) { const t0 = Date.now(); let timer;
    try { await Promise.race([t.fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timed out after ' + (t.timeout || 60000) / 1000 + ' s')), t.timeout || 60000); })]); console.log(`  ✓ ${t.name} (${Date.now() - t0} ms)`); }
    catch (e) { if (t.known) { known++; console.log(`  ~ ${t.name} — known issue: ${e.message.split('\n')[0]}`); } else { fail++; console.log(`  ✗ ${t.name}\n      ${e.message.split('\n')[0]}`); } }
    finally { clearTimeout(timer); } }
  console.log(`${path.basename(file)}: ${T.length - fail - known} passed, ${fail} failed, ${known} known${stray ? `, ${stray} unhandled rejection(s)` : ''}`); reported = true; process.exitCode = fail || stray ? 1 : 0;
  // a failed test may leave browsers open: close them (max 5 s) so their temporary profiles can be removed, then never hang
  await Promise.race([Promise.all([...CONTEXTS].map(c => c.close().catch(() => {}))), new Promise(r => setTimeout(r, 5000).unref())]);
  setTimeout(() => process.exit(process.exitCode), 500).unref();
}
const assert = (c, m) => { if (!c) throw new Error(m); };

// ---------- WP-1 helpers (accounting, inventory, backup) ----------
// Set form fields by id and fire the events the app listens to.
const fill = (p, f) => p.evaluate(f => { for (const [k, v] of Object.entries(f)) { const e = document.getElementById(k); if (!e) throw new Error('no field ' + k);
  if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } }, f);
// Submit the top form; confirm in-app dialogs (recorded) and re-submit when the app asks for a second tap.
async function submitForm(p) {
  const dialogs = [];
  for (let i = 0; i < 4; i++) {
    const v0 = await p.evaluate(() => window._dv || 0);
    const r = await p.evaluate(() => { const f = [...document.querySelectorAll('#sheetRoot:not([hidden]) form[data-form]')].pop(); if (!f) return 'none';
      (f.querySelector('button[type=submit]') || [...f.querySelectorAll('button.pri:not([type=button])')].pop() || { click: () => f.requestSubmit() }).click(); return f.dataset.form; });
    if (r === 'none') throw new Error('no form to submit');
    for (let t = 0; t < 30; t++) {
      const st = await p.evaluate(v0 => ({ dv: (window._dv || 0) > v0, dlg: (() => { const d = document.getElementById('dlgRoot'); return d && !d.hidden && d.innerText.trim() ? d.innerText.trim().slice(0, 120) : ''; })() }), v0);
      if (st.dlg) { dialogs.push(st.dlg); await p.evaluate(() => document.querySelector('#dlgRoot [data-dv=ok]').click()); continue; }
      if (st.dv) return dialogs;
      await p.waitForTimeout(100);
    }
  }
  throw new Error('form did not save; dialogs: ' + dialogs.join(' / '));
}
// Wait until no save is in flight: the data version stops changing for 150 ms.
async function settle(p) { let last = -1; for (let i = 0; i < 40; i++) { const v = await p.evaluate(() => window._dv || 0); if (v === last) return; last = v; await p.waitForTimeout(150); } }

// Accounting and inventory invariants. Returns a list of violations (empty = all hold).
const invariants = p => p.evaluate(() => {
  const bad = [], E = autoEntries(), B = balancesByAcc(E, 'تومان'), nat = c => { const x = B[c]; return x ? x.dr - x.cr : 0; };
  const tb = Object.values(B).reduce((a, x) => a + x.dr - x.cr, 0); if (Math.abs(tb) > 1) bad.push('trial balance ≠ 0: ' + tb);
  const ub = E.filter(e => Math.abs(e.lines.reduce((a, l) => a + l.dr - l.cr, 0)) > 0.5); if (ub.length) bad.push(ub.length + ' unbalanced entries');
  const pb = Object.values(personBal()).reduce((a, m) => a + (m['تومان'] || 0), 0), arap = nat('1201') + nat('2101');
  if (Math.abs(pb - arap) > 1) bad.push(`person balances ${pb} ≠ receivables−payables ${arap}`);
  const sv = S.lots.filter(l => !l.void).reduce((a, l) => { const q = lotStat(l).rem; return q > 1e-4 ? a + q * lotCost(l) : a; }, 0);
  if (Math.abs(sv - nat('1301')) > 1) bad.push(`stock value ${sv} ≠ inventory account ${nat('1301')}`);
  S.lots.filter(l => !l.void).forEach(l => { const st = lotStat(l); if (st.rem < -1e-9) bad.push('negative lot ' + lotName(l));
    const out = lotMoves(l.id).filter(m => !m.void).reduce((a, m) => a + ((MOVE[m.kind] || { s: -1 }).s < 0 ? Number(m.qty) : -Number(m.qty)), 0);
    if (Math.abs(Number(l.qty) - out - st.rem) > 1e-6) bad.push('lot quantity mismatch ' + lotName(l)); });
  if (S.docs.some(d => !d.void && S.docs.some(n => !n.void && n.redoOf === d.id))) bad.push('two live versions of one document');
  return bad;
});

// Full synthetic business seed through the real forms. step(name) is called after every step.
async function seedFull(p, step = async () => {}) {
  await p.evaluate(async () => { for (const [id, name] of [['p_a', 'علی آزمون'], ['p_b', 'بهرام نمونه'], ['p_c', 'کریم تستی'], ['p_d', 'داوود فرضی']]) await putRaw('people', { id, name, created: nowTs(), updated: nowTs() });
    await putRaw('meta', { id: 'accts', a: { 'بانک الف': { open: 200e6, openDate: '2026-09-23', setAt: nowTs() } }, created: nowTs(), updated: nowTs() }); render(); });
  await step('people + bank account');
  const doc = async (d, f, name) => { await openDoc(p, d); if (f) await fill(p, f); await submitForm(p); await settle(p); await step(name); };
  await doc({ type: 'purchase', personId: 'p_b', date: '2026-09-25', led: 'payable', discP: 10, items: [{ desc: 'عسل گون', qty: 100, unit: 'کیلو', price: 0.5e6 }, { desc: 'عسل کنار', qty: 50, unit: 'کیلو', price: 0.4e6 }, { desc: 'کرایه حمل', qty: 1, unit: 'خدمت', price: 3e6, src: 'svc' }] }, { f_dnow: '۱۰', f_nacct: 'بانک الف' }, 'purchase, 10% discount, transport, part paid');
  await doc({ type: 'purchase', personId: 'p_c', date: '2026-09-26', led: 'paid', tax: 10, items: [{ desc: 'عسل آویشن', qty: 10, unit: 'کیلو', price: 1e6 }] }, { f_acct: 'بانک الف' }, 'cash purchase with 10% tax');
  const L = await p.evaluate(() => Object.fromEntries(S.lots.filter(l => !l.void).map(l => [l.variety, l.id])));
  await doc({ type: 'invoice', personId: 'p_a', date: '2026-09-28', led: 'received', items: [{ desc: 'عسل گون', qty: 30, unit: 'کیلو', price: 0.8e6, src: 'lot', lotId: L['گون'] }] }, { f_acct: 'بانک الف' }, 'cash sale');
  await doc({ type: 'invoice', personId: 'p_a', date: '2026-10-01', led: 'receivable', disc: 1e6, items: [{ desc: 'عسل کنار', qty: 20, unit: 'کیلو', price: 0.7e6, src: 'lot', lotId: L['کنار'] }] }, { f_dnow: '۳', f_nacct: 'بانک الف' }, 'credit sale, discount, part received');
  await doc({ type: 'invoice', personId: 'p_d', date: '2026-10-02', led: 'gift', items: [{ desc: 'عسل گون', qty: 2, unit: 'کیلو', src: 'lot', lotId: L['گون'] }] }, null, 'gift');
  await doc({ type: 'sret', personId: 'p_a', date: '2026-10-05', led: 'payable', items: [{ desc: 'عسل کنار', qty: 5, unit: 'کیلو', price: 0.7e6, src: 'lot', lotId: L['کنار'] }] }, null, 'sale return');
  await doc({ type: 'invoice', personId: 'p_c', date: '2026-10-06', led: 'receivable', tax: 10, items: [{ desc: 'عسل آویشن', qty: 4, unit: 'کیلو', price: 1.5e6, src: 'lot', lotId: L['آویشن'] }] }, null, 'credit sale with tax');
  const vch = async (fn, name) => { await p.evaluate(fn); await p.waitForSelector('#sheetRoot form[data-form]'); await submitForm(p); await settle(p); await step(name); };
  await vch(() => { closeSheet(); payVoucher({ inn: true, personId: 'p_a', amount: 5e6, desc: 'دریافت آزمون' }); }, 'payment received');
  await vch(() => { closeSheet(); payVoucher({ inn: false, personId: 'p_b', amount: 20e6, desc: 'پرداخت آزمون' }); }, 'payment made');
  await vch(() => { closeSheet(); formVoucher({ desc: 'اجاره آزمون', lines: [{ acc: '5106', dr: 5e6 }, { acc: '1101', bank: 'بانک الف', cr: 5e6 }] }); }, 'manual voucher');
  // edit the credit sale with tax (4 kg → 3 kg) through the replacement path
  const sid = await p.evaluate(() => S.docs.find(d => !d.void && d.type === 'invoice' && d.personId === 'p_c').id);
  await p.evaluate(id => { closeSheet(); const d = byId('docs', id); const { id: _i, posted, void: _v, created, updated, ...cp } = d; formDoc({ ...cp, inv: d.inv, redoOf: id }); }, sid);
  await p.waitForSelector('#sheetRoot form[data-form=doc]');
  await p.evaluate(() => { const q = document.querySelector('#ditems .di_q'); q.value = '3'; q.dispatchEvent(new Event('input', { bubbles: true })); });
  await submitForm(p); await settle(p); await step('edit sale 4 kg → 3 kg');
  // void the gift
  const gid = await p.evaluate(() => S.docs.find(d => !d.void && d.type === 'invoice' && d.led === 'gift').id);
  await p.evaluate(id => { closeSheet(); viewDoc(id); }, gid);
  await p.evaluate(() => document.querySelector('#sheetRoot [data-act=docDel]').click());
  await p.waitForFunction(() => document.querySelector('#sheetRoot [data-act=docDel]').dataset.sure === '1');
  await p.evaluate(() => document.querySelector('#sheetRoot [data-act=docDel]').click());
  await p.waitForFunction(id => byId('docs', id).void, gid); await settle(p); await step('void the gift');
}

module.exports = { tempProfile, ROOT, serve, launch, openApp, ready, openDoc, submit, sig, seedSmall, test, run, assert, fill, submitForm, settle, invariants, seedFull };
