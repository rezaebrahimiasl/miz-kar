// Backup → restore safety on clean synthetic profiles. No network: backups are built in the page, never uploaded.
const { serve, launch, openApp, sig, sigAndBackup, settle, seedFull, test, run, assert } = require('./lib');
let srv, A, fpA, plain, enc; const PASS = 'synthetic-passphrase';
const toastHas = (p, re) => p.waitForFunction(re => new RegExp(re).test([...document.querySelectorAll('.toast,#toast')].map(x => x.textContent).join(' ')), re, { timeout: 5000 }).then(() => true).catch(() => false);
async function restoreFromJson(p, j) { await p.evaluate(j => restoreJson(JSON.parse(j), 'آزمون'), j); await p.waitForSelector('#sheetRoot [data-act=rsGo]'); await p.evaluate(() => restoreApply(false)); }
// On a mismatch, say exactly what differs (rows per collection, GL accounts, person balances) so a rare failure can be diagnosed.
const sigDiff = (a, b) => { const A = JSON.parse(a), B = JSON.parse(b); const out = [];
  for (const k of ['rows', 'gl', 'pb']) for (const x of new Set([...Object.keys(A[k]), ...Object.keys(B[k])])) { const u = JSON.stringify(A[k][x]), v = JSON.stringify(B[k][x]); if (u !== v) out.push(`${k}.${x}: ${u} → ${v}`); }
  return out.join('; ').slice(0, 600); };
async function fresh() { const o = await launch(); await openApp(o, srv.url); return o; }

test('setup: device A with a full synthetic business cycle; plain and encrypted backups built', async () => {
  srv = await serve(); A = await fresh(); await seedFull(A.page);
  await settle(A.page);
  // reference fingerprint and backups from one consistent moment (they used to be taken separately: an intermittent «restored data differs»)
  [fpA, plain] = await sigAndBackup(A.page);
  enc = await A.page.evaluate(([j, pw]) => ghPack(JSON.parse(j), pw), [plain, PASS]);
  assert(enc.startsWith('{"app":"miz-kar-enc"') && !enc.includes('علی آزمون'), 'encrypted backup is not encrypted');
});

test('(a) plain backup → clean device → identical rows, ledger balances and person balances', async () => {
  const B = await fresh(); assert((await B.page.evaluate(() => S.ledger.length + S.docs.length)) === 0, 'device B not empty');
  await restoreFromJson(B.page, plain); const sB = await sig(B.page); assert(sB === fpA, 'restored data differs: ' + sigDiff(fpA, sB));
  assert(!B.errors.length, B.errors.join(' | ')); await B.ctx.close();
});

test('(b) encrypted backup + right passphrase (file restore path) → identical', async () => {
  const C = await fresh(); await C.page.evaluate(pw => { GH.cfg = { pass: pw }; }, PASS);
  await C.page.evaluate(e => doRestore(new File([e], 'backup-enc.json', { type: 'application/json' })), enc);
  await C.page.waitForSelector('#sheetRoot [data-act=rsGo]'); await C.page.evaluate(() => restoreApply(false));
  const sC = await sig(C.page); assert(sC === fpA, 'restored data differs: ' + sigDiff(fpA, sC)); await C.ctx.close();
});

test('(c) encrypted backup + wrong passphrase → rejected, nothing written', async () => {
  const D = await fresh(); await D.page.evaluate(() => { GH.cfg = { pass: 'wrong-pass' }; });
  const before = await sig(D.page);
  await D.page.evaluate(e => doRestore(new File([e], 'backup-enc.json')), enc);
  assert(await toastHas(D.page, 'رمز درست نیست'), 'no wrong-passphrase message');
  assert((await sig(D.page)) === before, 'data changed after a rejected restore');
  // (d) a file that is not a backup
  await D.page.evaluate(() => doRestore(new File(['{"hello":1}'], 'x.json')));
  assert(await toastHas(D.page, 'پشتیبان میز کار نیست'), 'non-backup file not rejected');
  assert((await sig(D.page)) === before, 'data changed after a non-backup file'); await D.ctx.close();
});

test('(e)(f) older backup on a newer device: newer local edits kept, deletions not resurrected, local-only rows kept, snapshot taken', async () => {
  const p = A.page;
  await p.evaluate(async () => { await save('people', 'p_c', { note: 'local-newer' }); await delDoc('people', 'p_d'); await save('people', null, { name: 'فقط محلی' }); });
  const nBefore = await p.evaluate(() => COLS.reduce((a, c) => a + S[c].length, 0));
  await restoreFromJson(p, plain);
  const r = await p.evaluate(async () => ({ note: (byId('people', 'p_c') || {}).note, p_d: !!byId('people', 'p_d'), local: S.people.some(x => x.name === 'فقط محلی'),
    snap: (await snapList()).some(s => s.reason === 'restore'), n: COLS.reduce((a, c) => a + S[c].length, 0) }));
  assert(r.note === 'local-newer', 'newer local edit overwritten');
  assert(!r.p_d, 'deleted record resurrected');
  assert(r.local, 'local-only record removed');
  assert(r.snap, 'no «before restore» snapshot');
  assert(r.n >= nBefore, `restore removed rows (${nBefore} → ${r.n})`);
});

test('(g) Excel export parses back to the same row count per collection', async () => {
  const r = await A.page.evaluate(async () => { const j = await xlsxParse(await xlsxBuild(backupData()).arrayBuffer());
    return COLS.filter(c => (j.data[c] || []).length !== S[c].length).map(c => `${c}: ${(j.data[c] || []).length} vs ${S[c].length}`); });
  assert(!r.length, r.join(', '));
});

test('no page errors, no external network', async () => {
  assert(!A.errors.length, A.errors.join(' | ')); assert(!A.net.external.length, A.net.external.join(' | ')); await A.ctx.close(); srv.close();
});
run(__filename);
