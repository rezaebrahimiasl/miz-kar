// 4.41: M3 (a proposal is done only when the submit of its own form wrote data), M4 (confirming a recurring payment from a bank
// message: one operation with its pair, reference kept, the same message never confirms a second row, a double tap confirms once),
// O5 (voice input messages: offline, unsupported, permission, service failure, finish), O6 (persistent storage: status shown, asked
// only on the user's tap), restore from a copy reports a failure, O4 (the font is bundled; no request to a font service) and WP-5 (tools/version.js). Synthetic data only.
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { ROOT, serve, launch, openApp, settle, invariants, test, run, assert } = require('./lib');
let srv, o, p;
const tap = (act, data = {}) => p.evaluate(([act, data]) => { const b = document.createElement('button'); b.dataset.act = act; Object.assign(b.dataset, data); document.body.appendChild(b); b.click(); b.remove(); }, [act, data]);
const sheet = () => p.evaluate(() => document.getElementById('sheetRoot').hidden ? '' : document.getElementById('sheetRoot').innerText);

test('setup: fake speech recognition and storage API before the app loads; font requests recorded', async () => {
  srv = await serve(); o = await launch(); p = o.page; o.fontReq = [];
  p.on('request', r => { if (/fonts\.(googleapis|gstatic)|\.woff2/.test(r.url())) o.fontReq.push(r.url()); });
  await o.ctx.addInitScript(() => {
    window.__persist = 0; window.__persisted = false;
    try { Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => { window.__persist++; window.__persisted = true; return true; } });
      Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => window.__persisted }); } catch (_) {}
    // a scripted recogniser: window.__sr = 'ok' | <error name> | 'silent' (never starts)
    window.__srLog = [];
    window.SpeechRecognition = class { start() { const m = window.__sr || 'ok'; window.__srLog.push('start'); if (m === 'silent') return;
        setTimeout(() => { this.onstart && this.onstart(); if (m === 'ok') { this.onresult && this.onresult({ results: [[{ transcript: 'فردا تماس با بانک' }]] }); }
          else if (m !== 'wait') { this.onerror && this.onerror({ error: m }); this.onend && this.onend(); } }, 20); }
      stop() { window.__srLog.push('stop'); setTimeout(() => this.onend && this.onend(), 10); } abort() { window.__srLog.push('abort'); setTimeout(() => { this.onerror && this.onerror({ error: 'aborted' }); this.onend && this.onend(); }, 10); } };
  });
  await openApp(o, srv.url);
  await p.evaluate(async () => { const n = nowTs(); await putRaw('people', { id: 'pa', name: 'شخص آزمون', created: n, updated: n }); render(); });
});

test('M3: a write by something else while the form is open does not mark the proposal done when its own save fails (storage error)', async () => {
  await p.evaluate(() => { localStorage.removeItem('miz.ai'); closeSheet(); asSheet('فردا خرید کارتن آزمون'); document.querySelector('#sheetRoot form[data-form=aisay] button.pri').click(); });
  await p.waitForFunction(() => typeof AS !== 'undefined' && AS && AS.acts && AS.acts.length > 0);
  await tap('asGo', { v: '0' }); await p.waitForSelector('#sheetRoot form[data-form=task]'); await p.waitForTimeout(50);
  // something else writes meanwhile (sync, a recurring job); then the user empties the title and submits: the save is refused
  const dv = await p.evaluate(async () => { const v = window._dv || 0; await save('people', null, { name: 'نوشتهٔ دیگر' }); return (window._dv || 0) - v; });
  assert(dv > 0, 'the other write did not count as a change');
  const n0 = await p.evaluate(() => S.tasks.length);
  // the save itself fails (storage full): nothing is written
  await p.evaluate(() => { const P = IDBObjectStore.prototype; window._op = P.put; P.put = function () { throw new DOMException('synthetic quota', 'QuotaExceededError'); }; document.querySelector('#sheetRoot form[data-form=task] button.pri').click(); });
  await p.waitForTimeout(300); await p.evaluate(() => { IDBObjectStore.prototype.put = window._op; }); await settle(p);
  const r = await p.evaluate(n0 => ({ done: AS.acts[0].done, added: S.tasks.length - n0 }), n0);
  assert(r.added === 0 && !r.done, 'failed save marked the proposal done: ' + JSON.stringify(r));
  // now a real save: done
  await p.evaluate(() => document.querySelector('#sheetRoot form[data-form=task] button.pri').click());
  await settle(p); await p.waitForTimeout(100);
  assert(await p.evaluate(() => AS.acts[0].done === true), 'saved proposal not done'); await p.evaluate(() => closeSheet());
});

// a pending recurring payment with its pair (transfer) row, offered for the shared bank message
const pend = (id, pair) => p.evaluate(async ([id, pair]) => { const n = nowTs(); const base = { kind: 'paid', amount: 2e6, currency: 'تومان', acct: 'بانک الف', category: 'اجاره', about: 'قسط دوره‌ای آزمون', date: today(), pending: true, settled: false, void: false, instrument: 'حواله', created: n, updated: n };
  await putRaw('ledger', { ...base, id, pairId: pair || undefined }); if (pair) await putRaw('ledger', { ...base, id: id + '_b', kind: 'received', acct: 'بانک ب', pairId: pair }); }, [id, pair]);
const share = t => p.evaluate(t => { closeSheet(); receiptSheet(t, null); }, t);

test('M4: a failure at the pair row confirms nothing; success confirms both with the bank reference in one operation', async () => {
  await pend('q1', 'pr1'); await share('برداشت ۲۰,۰۰۰,۰۰۰ ریال از حساب شما شماره پیگیری 778899');
  const st = () => p.evaluate(() => ['q1', 'q1_b'].map(id => { const x = byId('ledger', id); return [x.pending, x.ref || '', x.rcpt || '']; }));
  const s0 = await st();
  await p.evaluate(() => { window._st = Store.stage; Store.stage = function (B, col, doc) { if (doc.id === 'q1_b') throw new Error('synthetic failure'); return window._st.apply(this, arguments); }; });
  await tap('rcptPend', { id: 'q1' }); await settle(p); await p.evaluate(() => { Store.stage = window._st; });
  assert(JSON.stringify(await st()) === JSON.stringify(s0), 'half confirmed: ' + JSON.stringify(await st()));
  await share('برداشت ۲۰,۰۰۰,۰۰۰ ریال از حساب شما شماره پیگیری 778899'); await tap('rcptPend', { id: 'q1' }); await settle(p);
  const s1 = await st(); assert(s1[0][0] === false && s1[1][0] === false && s1[0][1] === '778899' && s1[0][2] === 'ref:778899', 'confirm: ' + JSON.stringify(s1));
});

test('M4: the same bank message never confirms a second pending row; a double tap confirms once', async () => {
  await pend('q2'); await p.evaluate(() => { window._rcpt = { ref: '778899', dir: 'out', toman: 2e6 }; });   // the message already used for q1
  await tap('rcptPend', { id: 'q2' }); await settle(p);
  const r = await p.evaluate(() => ({ pending: byId('ledger', 'q2').pending, rcpt: byId('ledger', 'q2').rcpt || '', toast: document.getElementById('toast').textContent }));
  assert(r.pending === true && !r.rcpt && /قبلاً ثبت شده/.test(r.toast), 'second row confirmed by the same message: ' + JSON.stringify(r));
  await pend('q3'); await share('برداشت ۲۰,۰۰۰,۰۰۰ ریال از حساب شما شماره پیگیری 112233');
  const n0 = await p.evaluate(() => S.ledger.length);
  await p.evaluate(() => { for (let i = 0; i < 2; i++) { const b = document.createElement('button'); b.dataset.act = 'rcptPend'; b.dataset.id = 'q3'; document.body.appendChild(b); b.click(); b.remove(); } });
  await settle(p);
  const q = await p.evaluate(n0 => ({ added: S.ledger.length - n0, pending: byId('ledger', 'q3').pending, ref: byId('ledger', 'q3').ref, same: S.ledger.filter(x => x.rcpt === 'ref:112233').length }), n0);
  assert(q.added === 0 && q.pending === false && q.ref === '112233' && q.same === 1, 'double tap: ' + JSON.stringify(q));
  const v = await invariants(p); assert(!v.length, v.join('; '));
});

test('O5 voice: offline, permission denied and «no speech» give their own message and never disable the built-in microphone', async () => {
  const mic = async () => { await p.evaluate(() => { closeSheet(); tab = 'today'; render(); }); await p.waitForSelector('[data-act=mic]'); await p.click('[data-act=mic]'); await p.waitForTimeout(150); };
  await o.ctx.setOffline(true); await p.evaluate(() => { window.__sr = 'ok'; window.__srLog = []; }); await mic();
  let t = await sheet(); assert(/اینترنت/.test(t) && /ضبط یادداشت صوتی/.test(t), 'offline message: ' + t.slice(0, 200));
  assert(await p.evaluate(() => !window.__srLog.length && !localStorage.getItem('miz.srbad')), 'offline: recogniser started or marked broken');
  await o.ctx.setOffline(false);
  await p.evaluate(() => { window.__sr = 'not-allowed'; }); await mic();
  t = await sheet(); assert(/اجازهٔ میکروفون/.test(t) && !(await p.evaluate(() => localStorage.getItem('miz.srbad'))), 'permission: ' + t.slice(0, 200));
  await p.evaluate(() => { window.__sr = 'no-speech'; }); await mic();
  assert(/صدایی نشنیدم/.test(await p.evaluate(() => document.getElementById('toast').textContent)), 'no speech toast');
  await p.evaluate(() => { window.__sr = 'aborted'; }); await mic();
  assert(!(await sheet()) && !(await p.evaluate(() => localStorage.getItem('miz.srbad'))), 'cancel opened a help sheet');
});

test('O5 voice: a service failure while online is remembered with a retry; the second press finishes and keeps the text', async () => {
  const mic = async () => { await p.evaluate(() => { closeSheet(); tab = 'today'; render(); }); await p.waitForSelector('[data-act=mic]'); await p.click('[data-act=mic]'); await p.waitForTimeout(150); };
  await p.evaluate(() => { window.__sr = 'network'; }); await mic();
  assert(await p.evaluate(() => localStorage.getItem('miz.srbad') === '1'), 'service failure not remembered');
  await p.evaluate(() => { window.__srLog = []; }); await mic();
  let t = await sheet(); assert(/دوباره امتحان کن/.test(t) && !(await p.evaluate(() => window.__srLog.length)), 'retry offer: ' + t.slice(0, 200));
  await tap('micRetry'); assert(!(await p.evaluate(() => localStorage.getItem('miz.srbad'))), 'retry did not clear');
  await p.evaluate(() => { window.__sr = 'wait'; window.__srLog = []; }); await mic(); await p.click('[data-act=mic]'); await p.waitForTimeout(100);
  const l = await p.evaluate(() => window.__srLog); assert(JSON.stringify(l) === '["start","stop"]', 'second press: ' + JSON.stringify(l));
  assert(await p.evaluate(() => !window._sr), 'recogniser still marked active');
  await p.evaluate(() => closeSheet());
});

test('O6: persistent storage is never requested at start; the backup page shows the state and asks only on the tap', async () => {
  assert(await p.evaluate(() => window.__persist === 0), 'persist() called at start-up');
  await p.evaluate(() => { closeSheet(); backupSheet(); }); await p.waitForFunction(() => document.getElementById('bkPersist'), null, { timeout: 8000 });
  let t = await p.evaluate(() => document.getElementById('bkPersist').innerText);
  assert(/فعال نیست/.test(t) && /مگابایت/.test(t) && (await p.evaluate(() => window.__persist === 0)), 'status before: ' + t);
  await tap('persistAsk'); await p.waitForFunction(() => /فعال ✓/.test((document.getElementById('bkPersist') || {}).innerText || ''));
  assert(await p.evaluate(() => window.__persist === 1), 'persist() not called exactly once'); await p.evaluate(() => closeSheet());
});

test('O4: the font is the bundled file (licence included), the page and printed documents use it, nothing asks a font service', async () => {
  await p.reload(); await p.waitForFunction(() => typeof LOAD_OK !== 'undefined' && LOAD_OK);
  await p.evaluate(() => document.fonts.load('16px Vazirmatn')); const ok = await p.evaluate(() => document.fonts.check('16px Vazirmatn') && [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Vazirmatn' && f.status === 'loaded'));
  assert(ok, 'bundled font not loaded');
  assert(o.fontReq.length && o.fontReq.every(u => u.startsWith(srv.url + 'fonts/')), 'font requests: ' + o.fontReq.join(' | '));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert(!/fonts\.(googleapis|gstatic)/.test(html + sw), 'a font service is still referenced');
  assert(sw.includes("'fonts/Vazirmatn-wght.woff2'") && fs.existsSync(path.join(ROOT, 'fonts', 'OFL.txt')) && /SIL Open Font License/.test(fs.readFileSync(path.join(ROOT, 'fonts', 'OFL.txt'), 'utf8')), 'pre-cache or licence');
  assert(fs.statSync(path.join(ROOT, 'fonts', 'Vazirmatn-wght.woff2')).size < 150000, 'font file larger than expected');
  const ff = await p.evaluate(() => fontFace()); assert(ff.includes(srv.url + 'fonts/Vazirmatn-wght.woff2'), 'print font address: ' + ff);
});

test('WP-5 tools/version.js: check, refuse a lower version, set every place, report the missing release notes; no git', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'miz-ver-')); try {
    for (const f of ['index.html', 'sw.js', 'version.json', 'HANDOFF.md', 'js/core.js', 'js/engine.js', 'js/backup.js', 'js/store.js']) { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f)); }
    const T = path.join(ROOT, 'tools', 'version.js'), env = { ...process.env, MIZ_ROOT: tmp };
    const runT = (...a) => { try { return { code: 0, out: execFileSync('node', [T, ...a], { env, encoding: 'utf8' }) }; } catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; } };
    const cur = fs.readFileSync(path.join(tmp, 'version.json'), 'utf8').match(/"v":\s*"([\d.]+)"/)[1];
    assert(runT('check').code === 0, 'check on the repository copy failed');
    assert(runT('set', '4.0').code === 2, 'a lower version was accepted');
    const [a, b] = cur.split('.').map(Number), nv = a + '.' + (b + 1);
    const dry = runT('set', nv, '--dry'); assert(dry.code === 0 && fs.readFileSync(path.join(tmp, 'sw.js'), 'utf8').includes(`miz-kar-v${cur}'`), 'dry run wrote');
    const r = runT('set', nv); assert(r.code === 1 && /WHATS_NEW/.test(r.out) && /HANDOFF/.test(r.out) && /Nothing was committed/.test(r.out), 'set: ' + r.out);
    const all = ['index.html', 'sw.js', 'version.json', 'js/core.js', 'js/engine.js', 'js/backup.js', 'js/store.js'].map(f => fs.readFileSync(path.join(tmp, f), 'utf8')).join('\n');
    assert(!all.includes(`'${cur}';`) && !all.includes(`"${cur}"`) && (all.match(new RegExp(nv.replace('.', '\\.'), 'g')) || []).length >= 7, 'not every place updated');
    assert(!fs.existsSync(path.join(tmp, '.git')), 'git touched');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('restore from a local copy: a failure (or cloud mode) shows a message, changes nothing and does not allow a smaller cloud copy', async () => {
  for (const how of ['fail', 'cloud']) {
    const r = await p.evaluate(async how => { const b = backupData(); b.data.people = b.data.people.slice(0, 1); window._snapJ = b; window.typedConfirm = async () => true; GH.cfg = { ...GH.cfg, allowShrink: false };
      const st = Store.stage; if (how === 'fail') Store.stage = function () { throw new Error('synthetic failure'); }; else mode = 'cloud';
      const n0 = S.people.length; try { const x = document.createElement('button'); x.dataset.act = 'snapApply'; x.dataset.v = 'all'; document.body.appendChild(x); x.click(); x.remove(); await new Promise(r => setTimeout(r, 300)); }
      finally { Store.stage = st; mode = 'local'; }
      return { same: S.people.length === n0, shrink: !!GH.cfg.allowShrink, toast: document.getElementById('toast').textContent }; }, how);
    assert(r.same && !r.shrink && (how === 'fail' ? /برنگشت و چیزی تغییر نکرد/ : /حالت ابری/).test(r.toast), how + ': ' + JSON.stringify(r));
  }
});

test('no page errors, nothing sent', async () => { assert(!o.errors.length, o.errors.join(' | ')); assert(!o.net.external.length, o.net.external.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
