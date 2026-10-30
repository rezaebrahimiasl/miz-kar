// The inputs recorded in tests/fixtures/core-ref.json (shared by tools/core-ref-gen.js and tests/46-core-ref.test.js).
// CASES runs inside the page; it only calls the core utilities.
const NOW = '2026-10-30T08:00:00.000Z';
const CASES = () => {
  const out = {};
  out.toG = []; for (let jy = 1390; jy <= 1420; jy++) for (let jm = 1; jm <= 12; jm++) for (const jd of [1, 15, 29, 30, 31]) { const g = J.toG(jy, jm, jd); out.toG.push([jy, jm, jd, g.gy, g.gm, g.gd, jIso(jy, jm, jd)]); }
  out.jOf = []; for (let d = '2011-03-01'; d <= '2042-03-31'; d = addDays(d, 3)) { const j = jOf(d); out.jOf.push([d, j.jy, j.jm, j.jd, jShort(d), wdOf(d)]); }
  out.jLong = []; for (let d = '2020-01-01'; d <= '2030-12-31'; d = addDays(d, 37)) out.jLong.push([d, jLong(d), jNice(d)]);
  out.jNice = ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-15', '2027-04-01', '2025-01-01', ''].map(d => [d, jNice(d), jShort(d)]);
  out.days = [['2026-10-30', 1], ['2026-10-30', -400], ['2024-02-28', 1], ['2025-03-20', 1], ['2026-12-31', 1], ['2026-03-29', 0]].map(([d, n]) => [d, n, addDays(d, n)]).concat([['2026-10-30', '2025-10-30'], ['2026-03-01', '2026-02-28'], ['2026-10-30', '2026-10-30'], ['2020-01-01', '2042-01-01']].map(([a, b]) => [a, b, diffDays(a, b)]));
  out.nextOcc = []; for (const rep of ['', 'daily', 'even', 'odd', 'weekly', 'monthly']) for (const b of ['2026-10-30', '2026-10-01', '2026-08-31', '2026-11-05', '2025-12-31', '2026-09-22']) out.nextOcc.push([rep, b, nextOcc(b, rep)]);
  out.parseJ = ['', 'امروز', 'دیروز', 'پریروز', 'فردا', '۱۴۰۵/۰۸/۰۸', '1405/8/8', '05/08/08', '1405-12-30', '1403/12/30', '1404/12/30', '1405/07/31', '1405/06/31', '1405/13/01', '1405/00/10', '۱۸ مهر', '18 مهر 1404', 'مهر', '۷/۱۸', '7.18', '14050808', '050808', '0718', '718', '18', 'abc', '1405/8', '۱۴۰۵/۰۲/۳۱', '۲۹ اسفند ۱۴۰۳', '۳۰ اسفند ۱۴۰۳', '   ۱۰ آبان  ', '1 فروردین 1390', '31 شهریور 1420', '1420/12/29'].map(s => [s, parseJ(s)]);
  out.text = ['0123456789', '12a۳', '', 'سلام 42', '٠١٢٣ ۴۵۶', null, 7].map(s => [s, fa(s), en(s)]);
  out.pad = [0, 5, 12, 123, '7'].map(n => [n, pad(n)]);
  out.esc = ['<b>"a" & \'b\'</b>', '', null, undefined, 0, 'متن ساده', '&amp;'].map(s => [String(s), esc(s)]);
  out.nfmt = [[0], [1], [-1], [1234567.891], [1234567.891, 0], [0.5, 1], [-0.04, 1], [-0.0004, 2], [1e9, 2], [12.3456, 3], [-12500.5]].map(a => [a, nfmt(...a)]);
  const V = [0, 0.04, 0.5, 0.95, 1, 7.5, 999, 1000, 1500, 99999, 1e5, 999999, 1e6, 1234567, 1500000, 2e6, 12345678, 1e9, -3.6e6, null, '2500000', 'x'];
  out.money = V.map(v => [String(v), moneyFull(v, 'تومان'), moneyFull(v, 'دلار'), money(v, 'تومان'), money(v, 'دلار'), tmR(v), rialTxt(v), rlS(v)]);
  out.base = [0, 1, 1.25, 0.0005, 3.6, null, ''].map(x => [String(x), toBase(x === '' ? null : x, 'تومان'), toBase(x === '' ? null : x, 'دلار'), fromBase(x, 'تومان'), fromBase(x, 'دلار'), fromBase(12500000, 'تومان')]);
  out.mil = ['تومان', '', null, undefined, 'دلار'].map(c => [String(c), MIL(c)]);
  out.ul = [ul('f_amt', 'تومان'), ul('f_x', 'دلار')];
  out.consts = { MONTHS, WD, REPS, REP, SCHED: JSON.parse(JSON.stringify(SCHED)), MD };
  return out;
};
module.exports = { NOW, CASES };
