// Information engine, step 3: due/overdue cheques, expenses by category, monthly profit (the app's own income statement,
// plRange) and a person's statement (stmtRows) — per currency, inclusive date boundaries, and no data changes. Synthetic data.
const { serve, launch, openApp, invariants, test, run, assert } = require('./lib');
let srv, o, p, D;
const X = q => p.evaluate(q => JSON.parse(JSON.stringify(qExec(qNorm(q)))), q);

test('setup: synthetic people, cheques, expenses, income and a person with rows in two currencies', async () => {
  srv = await serve(); o = await launch(); p = o.page; await openApp(o, srv.url);
  D = await p.evaluate(async () => { const n = nowTs(), b = { created: n, updated: n, void: false }, d = k => addDays(today(), k);
    // two Jalali months: Mehr and Aban 1405
    const M7a = jIso(1405, 7, 1), M7z = jIso(1405, 7, 30), M8a = jIso(1405, 8, 1), M8z = addDays(jIso(1405, 9, 1), -1);
    for (const [id, name] of [['ca', 'مشتری چک آزمون'], ['cs', 'تأمین‌کنندهٔ چک آزمون'], ['st', 'طرف صورت‌حساب آزمون']]) await putRaw('people', { id, name, ...b });
    await putRaw('meta', { id: 'accts', a: { 'بانک الف': { open: 500e6, openDate: '2026-01-01' } }, ...b });
    const C = (id, dir, personId, amount, due, extra = {}) => putRaw('cheques', { id, dir, personId, amount, due, no: 'N' + id, bank: 'بانک آزمون', status: 'wait', hist: [], ...b, ...extra });
    await C('c1', 'in', 'ca', 5e6, d(-2)); await C('c2', 'out', 'cs', 2e6, d(3)); await C('c3', 'in', 'ca', 7e6, d(20)); await C('c4', 'in', 'ca', 9e6, d(-1), { status: 'cleared' });
    await C('c5', 'in', 'ca', 100, d(1), { currency: 'دلار' }); await C('c6', 'in', 'ca', 4e6, d(1), { void: true });
    const L = (id, kind, amount, date, extra = {}) => putRaw('ledger', { id, kind, amount, currency: 'تومان', acct: 'بانک الف', date, settled: false, instrument: kind === 'receivable' || kind === 'payable' ? 'نسیه' : 'نقد/کارت', about: 'آزمون ' + id, ...b, ...extra });
    await L('e1', 'paid', 3e6, M7a, { category: 'اجاره' }); await L('e2', 'paid', 1e6, M7z, { category: 'اجاره' }); await L('e3', 'paid', 0.5e6, M8a, { category: 'حمل و نقل' });
    await L('e4', 'paid', 2e6, M7a, { category: 'اجاره', pending: true }); await L('e5', 'paid', 6e6, M7a, { category: INVEST });
    await L('e6', 'paid', 40, M8a, { category: 'اجاره', currency: 'دلار' }); await L('e7', 'paid', 8e6, M7a, { category: 'اجاره', void: true });
    await L('i1', 'received', 10e6, M7z, { category: 'سایر درآمد' }); await L('i2', 'received', 4e6, M8a, { category: 'سایر درآمد' });
    // statement person: toman receivable, linked receipt, a payable; a dollar receivable
    await L('s1', 'receivable', 10e6, M7a, { personId: 'st', category: 'فروش کالا', acct: '' }); await L('s2', 'received', 4e6, M7z, { personId: 'st', refId: 's1', category: 'فروش کالا' });
    await L('s3', 'payable', 1e6, M8a, { personId: 'st', category: 'اجاره', acct: '' }); await L('s4', 'receivable', 50, M7z, { personId: 'st', currency: 'دلار', category: 'فروش کالا', acct: '' });
    render(); return { M7a, M7z, M8a, M8z, today: today(), d: { m2: d(-2), p1: d(1), p3: d(3), p20: d(20) } }; });
  const v = await invariants(p); assert(!v.length, 'fixtures: ' + v.join('; '));
});

test('cheques: in progress only, due within 7 days by default (overdue included), sorted by due date; totals per direction and currency', async () => {
  const r = await X({ entity: 'cheques' });
  assert(r.rows.map(x => x.id).join() === 'c1,c5,c2' && r.kpi.count === 3 && r.kpi.overdue === 1, 'rows: ' + JSON.stringify(r.rows.map(x => [x.id, x.due, x.overdue])));
  assert(JSON.stringify(r.kpi.inSums) === JSON.stringify({ 'تومان': 5e6, 'دلار': 100 }) && JSON.stringify(r.kpi.outSums) === JSON.stringify({ 'تومان': 2e6 }), 'totals: ' + JSON.stringify(r.kpi));
  assert(r.rows[0].overdue && r.rows[0].days === -2 && r.rows.every(x => x.col === 'cheques'), 'overdue flag: ' + JSON.stringify(r.rows[0]));
  const out = await X({ entity: 'cheques', dir: 'out' }), who = await X({ entity: 'cheques', person: 'مشتری چک آزمون' });
  assert(out.rows.map(x => x.id).join() === 'c2' && who.rows.map(x => x.id).join() === 'c1,c5', 'filters: ' + JSON.stringify([out.rows.length, who.rows.length]));
});

test('cheques: date boundaries are inclusive on both ends', async () => {
  const toD = await p.evaluate(d => d, D.d.p20), a = await X({ entity: 'cheques', to: toD }), b = await X({ entity: 'cheques', from: D.d.p1, to: D.d.p3 });
  assert(a.rows.map(x => x.id).join() === 'c1,c5,c2,c3', 'to = due date of c3: ' + a.rows.map(x => x.id).join());
  assert(b.rows.map(x => x.id).join() === 'c5,c2', 'from/to = due dates of c5 and c2: ' + b.rows.map(x => x.id).join());
});

test('expenses by category: paid rows without settlements, pending or investments; inclusive dates; another currency is its own group', async () => {
  const r = await X({ entity: 'expense', from: D.M7a, to: D.M8z });
  const G = Object.fromEntries(r.groups.map(([k, v]) => [k, [v.v, v.cur, v.n]]));
  assert(JSON.stringify(G) === JSON.stringify({ 'اجاره': [4e6, 'تومان', 2], 'حمل و نقل': [0.5e6, 'تومان', 1], 'اجاره (دلار)': [40, 'دلار', 1] }), 'groups: ' + JSON.stringify(G));
  assert(JSON.stringify(r.kpi.sums) === JSON.stringify({ 'تومان': 4.5e6, 'دلار': 40 }), 'totals: ' + JSON.stringify(r.kpi.sums));
  const oneDay = await X({ entity: 'expense', from: D.M7z, to: D.M7z });
  assert(oneDay.rows.map(x => x.id).join() === 'e2', 'single day: ' + oneDay.rows.map(x => x.id).join());
});

test('monthly profit = the app\'s income statement (plRange) for each Jalali month; months add up; boundary days land in the right month', async () => {
  const r = await X({ entity: 'profit', from: D.M7a, to: D.M8z });
  const want = await p.evaluate(D => [plRange(D.M7a, D.M7z), plRange(D.M8a, D.M8z), plRange(D.M7a, D.M8z)], D);
  assert(r.rows.length === 2 && r.rows[0].month === '۱۴۰۵/۰۷' && r.rows[0].from === D.M7a && r.rows[0].to === D.M7z && r.rows[1].from === D.M8a && r.rows[1].to === D.M8z, 'months: ' + JSON.stringify(r.rows.map(x => [x.month, x.from, x.to])));
  r.rows.forEach((x, i) => assert(x.inc === want[i].inc && x.exp === want[i].exp && x.profit === want[i].inc - want[i].exp && x.pers === want[i].pers, `month ${x.month}: ` + JSON.stringify([x, want[i]])));
  assert(r.kpi.profit === want[2].inc - want[2].exp && Math.abs(r.rows[0].profit + r.rows[1].profit - r.kpi.profit) < 1, 'total: ' + JSON.stringify(r.kpi));
  assert(r.rows[0].inc >= 10e6 && r.rows[1].inc >= 4e6, 'income of the last day of Mehr / first day of Aban in the wrong month: ' + JSON.stringify(r.rows));
  assert(r.kpi.currency === 'تومان' && r.warn.includes('currency') && JSON.stringify(r.otherCur) === '["دلار"]', 'other currencies must be reported, not added: ' + JSON.stringify(r));
  const part = await X({ entity: 'profit', from: D.M7z, to: D.M8a });   // two partial months
  assert(part.rows.length === 2 && part.rows[0].from === D.M7z && part.rows[1].to === D.M8a, 'partial months: ' + JSON.stringify(part.rows.map(x => [x.from, x.to])));
  const bad = await X({ entity: 'profit', from: D.M8z, to: D.M7a }); assert(!bad.rows.length && bad.warn.includes('range'), 'reversed range: ' + JSON.stringify(bad));
});

test('person statement = the person page\'s ledger (stmtRows), one per currency; opening balance before «from», closing = balance', async () => {
  const r = await X({ entity: 'statement', person: 'طرف صورت‌حساب آزمون' });
  const cur = r.statements.map(s => s.currency); assert(JSON.stringify(cur) === '["تومان","دلار"]', 'currencies: ' + JSON.stringify(cur));
  const [t, u] = r.statements, pb = await p.evaluate(() => personBal().st);
  assert(t.opening === 0 && t.closing === 5e6 && t.closing === pb['تومان'] && t.dr === 10e6 && t.cr === 5e6 && t.rows.map(x => x.id).join() === 's1,s2,s3', 'toman: ' + JSON.stringify(t));
  assert(u.closing === 50 && u.closing === pb['دلار'] && u.rows.length === 1, 'dollar: ' + JSON.stringify(u));
  const page = await p.evaluate(() => stmtRows('st', 'تومان').map(x => x.bal)); assert(JSON.stringify(t.rows.map(x => x.bal)) === JSON.stringify(page), 'differs from the person page');
  const later = await X({ entity: 'statement', person: 'طرف صورت‌حساب آزمون', from: D.M7z });
  const lt = later.statements[0]; assert(lt.opening === 10e6 && lt.closing === 5e6 && lt.rows.map(x => x.id).join() === 's2,s3' && lt.cr === 5e6 && lt.dr === 0, 'from: ' + JSON.stringify(lt));
  const none = await X({ entity: 'statement' }), miss = await X({ entity: 'statement', person: 'کسی که نیست' });
  assert(!none.statements && none.warn.includes('person') && miss.noPerson && !miss.statements, 'no person: ' + JSON.stringify([none, miss]));
});

test('zero data mutations: every new query leaves data, write counter and storage untouched', async () => {
  const r = await p.evaluate(async D => { const snap = () => JSON.stringify(COLS.map(c => S[c])), v0 = window._dv, s0 = snap(), u0 = localStorage.getItem('miz.unsent');
    for (const q of [{ entity: 'cheques' }, { entity: 'cheques', dir: 'in', to: D.d.p20 }, { entity: 'expense', from: D.M7a, to: D.M8z }, { entity: 'profit' }, { entity: 'profit', from: D.M7a, to: D.M8z }, { entity: 'statement', pid: 'st' }, { entity: 'statement', person: 'طرف صورت‌حساب آزمون', from: D.M8a }]) qExec(qNorm(q));
    await new Promise(r => setTimeout(r, 200)); return { same: s0 === snap() && v0 === window._dv && u0 === localStorage.getItem('miz.unsent') }; }, D);
  assert(r.same, 'a query changed data');
  const v = await invariants(p); assert(!v.length, v.join('; '));
});

test('no page errors, nothing sent', async () => { assert(!o.errors.length, o.errors.join(' | ')); assert(!o.net.external.length, o.net.external.join(' | ')); await o.ctx.close(); await srv.close(); });
run(__filename);
