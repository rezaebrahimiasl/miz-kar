// Cloud backup must never leave the phone unencrypted (O1). GitHub is replaced by an in-memory fake; synthetic data only.
const { serve, launch, openApp, test, run, assert } = require('./lib');
let srv, o; const gh = { puts: [], file: null };
const MARK = 'SYN-BACKUP-MARKER';

async function fakeGitHub(ctx) {
  await ctx.route('https://api.github.com/**', r => { const q = r.request(), u = q.url();
    if (q.method() === 'PUT') { const b = JSON.parse(q.postData()); gh.puts.push(Buffer.from(b.content, 'base64').toString()); gh.file = b.content;
      return r.fulfill({ status: 201, contentType: 'application/json', body: '{"content":{"sha":"s1"}}' }); }
    if (/\/contents\//.test(u)) return gh.file ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha: 's1', encoding: 'base64', content: gh.file }) })
                                              : r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });   // repo exists
}
const settle = () => o.page.waitForFunction(() => !ghBusy && !syncBusy, null, { timeout: 8000 });

test('setup: synthetic records incl. a clinical note; backup configured WITHOUT passphrase', async () => {
  srv = await serve(); o = await launch(); await fakeGitHub(o.ctx); await openApp(o, srv.url);
  await o.page.evaluate(async M => { await save('people', null, { name: 'بیمار ساختگی' });
    await save('cases', null, { code: 'SYN-1', personId: S.people[0].id, complaint: M, status: 'open' });
    GH.cfg = { repo: 'synthetic/backup', token: 'SYNTHETIC-NOT-A-TOKEN' }; ghDirty = true; }, MARK);
});

test('no passphrase: reconnect (automatic path) uploads nothing and records the Persian warning', async () => {
  await o.page.evaluate(() => window.dispatchEvent(new Event('online'))); await settle();
  assert(gh.puts.length === 0, gh.puts.length + ' upload(s) without passphrase');
  const w = await o.page.evaluate(() => [GH.cfg.err, safetyIssues().map(x => x[0]).join(' | ')]);
  assert(/بدون رمز رمزنگاری هیچ داده‌ای فرستاده نمی‌شود/.test(w[0]), 'warning not recorded: ' + w[0]);
  assert(/پشتیبان ابری متوقف است/.test(w[1]), 'safety list does not show the stop: ' + w[1]);
});

test('no passphrase: daily/timer path (ghPush) and manual «الان بفرست» upload nothing; manual shows the warning', async () => {
  await o.page.evaluate(() => ghPush()); await settle();
  await o.page.evaluate(() => ghPush(true)); await settle();
  assert(gh.puts.length === 0, gh.puts.length + ' upload(s) without passphrase');
  assert(await o.page.evaluate(() => /بدون رمز رمزنگاری/.test([...document.querySelectorAll('.toast,#toast')].map(x => x.textContent).join(' '))), 'no warning toast on manual send');
});

test('no passphrase: multi-device sync switched on still uploads nothing', async () => {
  await o.page.evaluate(() => { GH.cfg = { ...GH.cfg, sync: true }; ghSync(true); }); await settle();
  assert(gh.puts.length === 0, gh.puts.length + ' upload(s) without passphrase');
});

test('with passphrase: backup is uploaded, encrypted, and decrypts back to the same data', async () => {
  await o.page.evaluate(() => { GH.cfg = { ...GH.cfg, sync: false, pass: 'synthetic-passphrase' }; ghDirty = true; ghPush(true); }); await settle();
  assert(gh.puts.length === 1, 'expected 1 upload, got ' + gh.puts.length);
  const body = gh.puts[0];
  assert(body.startsWith('{"app":"miz-kar-enc"'), 'upload is not in the encrypted format');
  assert(!body.includes(MARK) && !body.includes('بیمار ساختگی'), 'plaintext found inside the encrypted upload');
  const r = await o.page.evaluate(async b => { const j = await ghUnpack(b, 'synthetic-passphrase');
    let wrong = 'opened'; try { await ghUnpack(b, 'wrong-pass'); } catch (_) { wrong = 'rejected'; }
    return { app: j.app, cases: j.data.cases.length, roundTrip: JSON.stringify(j.data.cases[0]) === JSON.stringify(S.cases[0]), wrong, err: GH.cfg.err || '' }; }, body);
  assert(r.app === 'miz-kar' && r.cases === 1 && r.roundTrip && r.wrong === 'rejected', JSON.stringify(r));
  assert(r.err === '', 'warning not cleared after a successful encrypted backup: ' + r.err);
});

test('with passphrase: sync uploads only the encrypted format', async () => {
  await o.page.evaluate(() => { GH.cfg = { ...GH.cfg, sync: true }; ghDirty = true; ghSync(true); }); await settle();
  assert(gh.puts.length >= 2, 'sync did not upload');
  assert(gh.puts.every(b => b.startsWith('{"app":"miz-kar-enc"') && !b.includes(MARK)), 'a sync upload was not encrypted');
});

test('no page errors; no other external host contacted', async () => {
  assert(!o.errors.length, o.errors.join(' | ')); assert(!o.net.external.length, o.net.external.join(' | '));
  await o.ctx.close(); srv.close();
});
run(__filename);
