// Privacy of clinical data (S3 calendar feed, S4 AI de-identification, S1 drafts of deleted records). Synthetic people only.
const { serve, launch, openApp, test, run, assert } = require('./lib');
let srv, o;
const PT = 'زهرا آزمونی', PT_PH = '09120000001', OTHER = 'علی کریمی';

test('setup: a synthetic patient with a case, appointments, a visit fee and a birthday; one ordinary customer', async () => {
  srv = await serve(); o = await launch(); await openApp(o, srv.url);
  await o.page.evaluate(async ([PT, PT_PH, OTHER]) => { const now = nowTs(), d = n => addDays(today(), n); const m = jOf(d(10));
    await putRaw('meta', { id: 'prefs', smartOn: ['calClinic'], created: now, updated: now });       // clinic appointments in the calendar ON
    await putRaw('people', { id: 'p_pt', name: PT, phone: PT_PH, occ: [{ t: 'تولد', m: m.jm, d: m.jd }], created: now, updated: now });
    await putRaw('people', { id: 'p_cu', name: OTHER, phone: '09120000002', occ: [{ t: 'تولد', m: m.jm, d: m.jd }], created: now, updated: now });
    await putRaw('cases', { id: 'c_1', code: 'SYN-CODE-7', personId: 'p_pt', contact: 'تلفن ۰۹۱۲۰۰۰۰۰۰۳', complaint: 'SYN-CLIN-1', status: 'open', created: now, updated: now });
    await putRaw('tasks', { id: 't_case', title: 'ویزیت ' + PT + ' SYN-CLIN-2', due: d(2), time: '10:00', caseId: 'c_1', status: 'open', created: now, updated: now });
    await putRaw('tasks', { id: 't_pers', title: 'تماس با ' + PT, note: 'SYN-CLIN-3', due: d(3), personId: 'p_pt', status: 'open', created: now, updated: now });
    await putRaw('tasks', { id: 't_free', title: 'خرید دارو برای ' + PT, due: d(4), status: 'open', created: now, updated: now });   // free text only
    await putRaw('ledger', { id: 'l_vf', kind: 'receivable', personId: 'p_pt', amount: 2e6, currency: 'تومان', about: 'حق ویزیت', date: today(), due: d(5), visitOf: 'c_1#1', settled: false, created: now, updated: now });
    await putRaw('ledger', { id: 'l_pt', kind: 'receivable', personId: 'p_pt', amount: 1e6, currency: 'تومان', about: '', date: today(), due: d(6), settled: false, created: now, updated: now });
    await putRaw('ledger', { id: 'l_cu', kind: 'receivable', personId: 'p_cu', amount: 3e6, currency: 'تومان', about: '', date: today(), due: d(7), settled: false, created: now, updated: now });
    render(); }, [PT, PT_PH, OTHER]);
});

test('S3: the .ics feed has no patient name, phone, case code or clinical note; events are kept with generic titles', async () => {
  const ics = await o.page.evaluate(() => calFeed());
  const leaks = [PT, 'زهرا', 'آزمونی', PT_PH, '۰۹۱۲۰۰۰۰۰۰۳', 'SYN-CODE-7', 'SYN-CLIN-1', 'SYN-CLIN-2', 'SYN-CLIN-3'].filter(m => ics.includes(m));
  assert(!leaks.length, 'feed contains: ' + leaks.join(', '));
  const ev = id => (ics.split('BEGIN:VEVENT').find(b => b.includes('UID:' + id)) || '');
  assert(/SUMMARY:نوبت درمانگاه/.test(ev('t-t_case')), 'clinic appointment missing or not generic');
  assert(/SUMMARY:نوبت درمانگاه/.test(ev('t-t_pers')) && !ev('t-t_pers').includes('DESCRIPTION'), 'task about a patient not generic');
  assert(ev('t-t_free').includes('SUMMARY:خرید دارو برای مراجع'), 'free-text mention not scrubbed: ' + ev('t-t_free').match(/SUMMARY:.*/));
  assert(/SUMMARY:سررسید طلب \(درمانگاه\)/.test(ev('l-l_vf')) && /SUMMARY:سررسید طلب \(درمانگاه\)/.test(ev('l-l_pt')), 'patient receivables not generic');
  assert(!ics.includes('UID:o-p_pt'), 'patient birthday in the feed');
  // ordinary (non-patient) events keep their detail
  assert(ev('l-l_cu').includes('SUMMARY:سررسید طلب از ' + OTHER), 'customer receivable lost its name');
  assert(ics.includes('UID:o-p_cu') && ics.includes('09120000002'), 'customer birthday lost');
});

test('S4: deid removes the patient, other registered people, unregistered names after a title/kinship word, phones, e-mail, links and addresses', async () => {
  const out = await o.page.evaluate(([PT, OTHER]) => deid(`SYN-CLIN-9 ${PT} با همسرش ${OTHER} و دخترش مریم صالحی آمد؛ خانم رضایی هم بود. تلفن ۰۹۱۲ ۰۰۰ ۰۰۰۴، کد ملی ۱۲۳۴۵۶۷۸۹۰، x@y.example، https://example.org/a. نشانی: تهران، خیابان آزمون پلاک ۱۲. سردرد کمتر شده.`, byId('cases', 'c_1')), [PT, OTHER]);
  const leaks = ['زهرا', 'آزمونی', 'علی', 'کریمی', 'مریم', 'صالحی', 'رضایی', '۰۹۱۲', '۱۲۳۴۵۶۷۸۹۰', 'x@y', 'example.org', 'خیابان آزمون', 'پلاک ۱۲'].filter(m => out.includes(m));
  assert(!leaks.length, 'still present: ' + leaks.join(', ') + ' — ' + out);
  assert(out.includes('مراجع') && out.includes('SYN-CLIN-9') && out.includes('سردرد کمتر شده'), 'clinical content lost or patient not marked: ' + out);
});

// ('علی' alone is not checked in the Gemini body: it occurs inside the ordinary word «فعلی» of the app's prompt)
// ---------- what actually leaves the phone: requests intercepted at the browser, nothing reaches the network ----------
const LEAKS_FEED = [PT, 'زهرا', 'آزمونی', PT_PH, '۰۹۱۲۰۰۰۰۰۰۳', 'SYN-CODE-7', 'SYN-CLIN-1', 'SYN-CLIN-2', 'SYN-CLIN-3'];
test('S3 outbound: the calendar upload request (gist body) carries no patient identifiers', async () => {
  const sent = [];
  await o.page.route('https://api.github.com/**', async r => { sent.push({ m: r.request().method(), u: r.request().url(), b: r.request().postData() || '' });
    await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'synthetic-gist', files: { 'miz-kar.ics': { raw_url: 'https://example.invalid/x' } } }) }); });
  await o.page.evaluate(() => { localStorage.setItem('miz.gh', JSON.stringify({ token: 'SYNTHETIC-NOT-A-TOKEN', cal: true })); });
  await o.page.evaluate(() => calPush(true));
  await o.page.unroute('https://api.github.com/**'); await o.page.evaluate(() => localStorage.removeItem('miz.gh'));
  const g = sent.filter(x => /\/gists/.test(x.u) && x.b); assert(g.length >= 1, 'no calendar upload request captured: ' + JSON.stringify(sent.map(x => x.m + ' ' + x.u)));
  const body = g.map(x => x.b).join('\n'); const ics = g.map(x => (JSON.parse(x.b).files || {})['miz-kar.ics']).filter(Boolean).map(f => f.content).join('\n');
  assert(ics.includes('BEGIN:VCALENDAR') && ics.includes('نوبت درمانگاه'), 'upload did not contain the feed');
  const leaks = LEAKS_FEED.filter(m => body.includes(m)); assert(!leaks.length, 'upload request contains: ' + leaks.join(', '));
});

test('S4 outbound: the Gemini requests (case summary and visit note) carry no names, phones or addresses', async () => {
  const sent = [];
  await o.page.route('https://generativelanguage.googleapis.com/**', async r => { sent.push(r.request().postData() || '');
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'x', obs: 'x' }) }] } }] }) }); });
  await o.page.evaluate(async ([PT, OTHER]) => { const now = nowTs(); localStorage.setItem('miz.ai', JSON.stringify({ key: 'SYNTHETIC-NOT-A-KEY', on: true }));
    await putRaw('visits', { id: 'v_1', caseId: 'c_1', no: 1, date: today(), obs: `SYN-CLIN-4 ${PT} با همسرش ${OTHER} آمد، تلفن ۰۹۱۲ ۰۰۰ ۰۰۰۴، خیابان آزمون پلاک ۱۲`, interp: 'SYN-CLIN-5', created: now, updated: now }); }, [PT, OTHER]);
  await o.page.evaluate(() => cAiSum('c_1'));
  for (let t = 0; sent.length < 1 && t < 50; t++) await o.page.waitForTimeout(100);
  await o.page.evaluate(() => { closeSheet(); formVisit('c_1'); });
  await o.page.waitForSelector('#f_vfree', { state: 'attached', timeout: 5000 });
  await o.page.evaluate(([PT]) => { document.getElementById('f_vfree').value = `SYN-CLIN-6 ${PT} با دخترش مریم صالحی آمد؛ کد ملی ۱۲۳۴۵۶۷۸۹۰`; return cAiNote('c_1'); }, [PT]);
  for (let t = 0; sent.length < 2 && t < 50; t++) await o.page.waitForTimeout(100);
  await o.page.evaluate(() => { document.getElementById('sheetRoot').dataset.dirty = ''; closeSheet(); localStorage.removeItem('miz.ai'); });
  await o.page.unroute('https://generativelanguage.googleapis.com/**');
  assert(sent.length >= 2, 'expected 2 Gemini requests, captured ' + sent.length);
  const body = sent.join('\n');
  assert(body.includes('SYN-CLIN-4') && body.includes('SYN-CLIN-6'), 'clinical text not in the requests (test would be vacuous)');
  const leaks = ['زهرا', 'آزمونی', OTHER, 'کریمی', 'مریم', 'صالحی', PT_PH, '۰۹۱۲', '۱۲۳۴۵۶۷۸۹۰', 'خیابان آزمون', 'پلاک ۱۲'].filter(m => body.includes(m));
  assert(!leaks.length, 'Gemini request contains: ' + leaks.map(m => m + ' «…' + body.slice(Math.max(0, body.indexOf(m) - 25), body.indexOf(m) + 25) + '…»').join(', '));
});

test('S1: deleting a record drops its unsaved drafts (other drafts kept); the record stays restorable from the trash', async () => {
  await o.page.evaluate(() => { const L = drGet(); L.unshift({ k: 'formCase:c_1', op: { fn: 'formCase', args: [{ id: 'c_1' }] }, title: 'x', at: Date.now(), data: { v: { f: 'SYN-CLIN-5' } } },
    { k: 'formVisit:', op: { fn: 'formVisit', args: ['c_1'] }, title: 'x', at: Date.now(), data: { v: { f: 'SYN-CLIN-6' } } },
    { k: 'formPerson:p_cu', op: { fn: 'formPerson', args: [{ id: 'p_cu' }] }, title: 'x', at: Date.now(), data: { v: { f: 'SYN-KEEP' } } },
    { k: 'formTask:', op: { fn: 'formTask', args: [{ caseId: 'c_1', title: 'x' }] }, title: 'x', at: Date.now(), data: { v: { f: 'SYN-KEEP-REF' } } }); drSet(L); });   // a different, unsaved record that only refers to the case
  await o.page.evaluate(() => delDoc('cases', 'c_1'));
  const r = await o.page.evaluate(() => ({ dr: localStorage.getItem('miz.drafts') || '', trash: JSON.parse(localStorage.getItem('miz.trash') || '[]').some(x => x.col === 'cases' && x.doc.id === 'c_1'), live: !!byId('cases', 'c_1') }));
  assert(!r.live, 'case not deleted');
  assert(!r.dr.includes('SYN-CLIN-5') && !r.dr.includes('SYN-CLIN-6'), 'draft of the deleted case kept');
  assert(r.dr.includes('SYN-KEEP') && r.dr.includes('SYN-KEEP-REF'), 'draft of another record removed');
  assert(r.trash, 'deleted case not in the trash (recovery policy changed)');
  assert(!o.errors.length, o.errors.join(' | '));
});

test('close', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
