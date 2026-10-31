// Inputs recorded in tests/fixtures/engine-ref.json (shared by tools/engine-ref-gen.js and tests/51-engine-ref.test.js):
// a synthetic business (seedFull + a few rows) and 126 «پرسش از داده‌ها» queries plus 15 offline questions; clock fixed.
const NOW = '2026-10-30T08:00:00.000Z';
const SEED = async () => { const n = nowTs(), b = { created: n, updated: n };
  await putRaw('tasks', { id: 'tq1', title: 'کار باز آزمون', status: 'open', due: addDays(today(), -2), personId: 'p_a', ...b });
  await putRaw('tasks', { id: 'tq2', title: 'کار انجام‌شده', status: 'done', doneAt: n, due: today(), ...b });
  await putRaw('ledger', { id: 'lq1', kind: 'receivable', personId: 'p_c', amount: 3e6, currency: 'تومان', due: addDays(today(), -4), date: addDays(today(), -30), settled: false, void: false, instrument: 'نسیه', category: 'فروش کالا', about: 'طلب سررسیده', ...b });
  await putRaw('quotes', { id: 'qq1', dir: 'gave', personId: 'p_a', product: 'عسل', price: 1.2e6, currency: 'تومان', unit: 'کیلو', date: addDays(today(), -3), void: false, ...b });
  await putRaw('ledger', { id: 'ex1', kind: 'paid', amount: 2e6, currency: 'تومان', acct: 'بانک الف', category: 'اجاره', about: 'اجاره آزمون', date: today(), settled: false, void: false, instrument: 'نقد/کارت', ...b });
  await putRaw('ledger', { id: 'in1', kind: 'received', personId: 'p_b', amount: 1e6, currency: 'تومان', acct: 'بانک الف', category: 'فروش کالا', about: 'دریافت آزمون', date: today(), settled: false, void: false, instrument: 'نقد/کارت', ...b });
  await putRaw('cheques', { id: 'cq1', dir: 'in', personId: 'p_a', amount: 4e6, due: addDays(today(), 2), no: '777', status: 'wait', hist: [], void: false, ...b }); };
const QUERIES = () => { const Q = [];
  for (const entity of ['sales', 'gifts', 'purchases', 'ledger', 'balance', 'overdue', 'tasks', 'stock', 'weird'])
    for (const ex of [{}, { group: 'person' }, { group: 'product' }, { group: 'month' }, { metric: 'list' }, { person: 'علی آزمون' }, { person: 'ناشناس' }, { product: 'گون' }, { from: '1405/07/01', to: '1405/07/10' }, { kind: 'receivable' }, { kind: 'payable' }, { status: 'done' }, { status: 'late' }, { status: 'open' }])
      Q.push({ entity, metric: 'sum', explain: 'آزمون', ...ex });
  for (const entity of ['cheques', 'expense', 'income', 'profit', 'statement', 'price'])
    for (const ex of [{}, { person: 'علی آزمون' }, { from: '1405/07/01', to: '1405/08/30' }, { dir: 'in' }, { product: 'عسل' }])
      Q.push({ entity, explain: 'آزمون', ...ex });
  return Q; };
const ASK = ['به علی آزمون چقدر بدهکارم؟', 'حساب کریم تستی چطور است؟', 'طلب‌هایم چقدر است؟', 'چقدر بدهکارم؟', 'خرج این ماه چقدر شد؟', 'درآمد امسال؟', 'هزینه پارسال چقدر بود؟', 'دریافت امروز از بهرام نمونه چقدر؟', 'آخرین قیمت عسل؟', 'قیمت عسل با علی آزمون؟', 'موجودی انبار؟', 'با علی آزمون چه کاری دارم؟', 'کی با بهرام نمونه جلسه دارم؟', 'هوا چطور است؟', 'سلام', 'چک‌های این هفته چیست؟', 'صورت حساب علی آزمون چطور است؟'];
// record ids (newId uses Math.random) must not differ between runs
const RANDOM = '(()=>{let x=123456789;Math.random=()=>{x=(x*1103515245+12345)%2147483648;return x/2147483648}})()';
module.exports = { NOW, SEED, QUERIES, ASK, RANDOM };
