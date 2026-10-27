// Smoke: the app loads, every main tab and domain page renders, no errors, no external calls (~5 s).
const { serve, launch, openApp, test, run, assert } = require('./lib');
let srv, o;
test('loads and draws the first view', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); });
test('every tab and domain page renders', async () => {
  const bad = await o.page.evaluate(() => { const out = [];
    for (const t of ['home', 'today', 'tasks', 'people', 'money']) { goTab(t); if (!document.getElementById('view').children.length) out.push(t); }
    for (const m of ['sum', 'stock', 'tx', 'ppl', 'plan', 'rep']) { ui.ms = m; goTab('money'); if (!document.getElementById('view').children.length) out.push('money/' + m); }
    for (const d of DOMS.filter(d => !d.go)) { ui.dom = d.id; goTab('dom'); if (!document.querySelector('.dom-hd')) out.push('dom/' + d.id); }
    goTab('home'); return out; });
  assert(!bad.length, 'empty: ' + bad.join(', '));
});
test('no page errors, no external network', async () => {
  assert(!o.errors.length, o.errors.join(' | ')); assert(!o.net.external.length, o.net.external.join(' | ')); await o.ctx.close(); srv.close();
});
run(__filename);
