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

test('S1: deleting a record drops its unsaved drafts (other drafts kept); the record stays restorable from the trash', async () => {
  await o.page.evaluate(() => { const L = drGet(); L.unshift({ k: 'formCase:c_1', op: { fn: 'formCase', args: [{ id: 'c_1' }] }, title: 'x', at: Date.now(), data: { v: { f: 'SYN-CLIN-5' } } },
    { k: 'formVisit:', op: { fn: 'formVisit', args: ['c_1'] }, title: 'x', at: Date.now(), data: { v: { f: 'SYN-CLIN-6' } } },
    { k: 'formPerson:p_cu', op: { fn: 'formPerson', args: [{ id: 'p_cu' }] }, title: 'x', at: Date.now(), data: { v: { f: 'SYN-KEEP' } } }); drSet(L); });
  await o.page.evaluate(() => delDoc('cases', 'c_1'));
  const r = await o.page.evaluate(() => ({ dr: localStorage.getItem('miz.drafts') || '', trash: JSON.parse(localStorage.getItem('miz.trash') || '[]').some(x => x.col === 'cases' && x.doc.id === 'c_1'), live: !!byId('cases', 'c_1') }));
  assert(!r.live, 'case not deleted');
  assert(!r.dr.includes('SYN-CLIN-5') && !r.dr.includes('SYN-CLIN-6'), 'draft of the deleted case kept');
  assert(r.dr.includes('SYN-KEEP'), 'unrelated draft removed');
  assert(r.trash, 'deleted case not in the trash (recovery policy changed)');
  assert(!o.errors.length, o.errors.join(' | '));
});

test('close', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
