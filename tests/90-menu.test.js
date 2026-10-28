// Every menu entry opens something without a page error (empty device and after a synthetic business cycle);
// the Help page lists every catalogue entry with a description. Synthetic data only.
const { serve, launch, openApp, seedFull, test, run, assert } = require('./lib');
let srv, o;
async function openAll(o) { const p = o.page, errors = o.errors;
  const acts = await p.evaluate(() => actsOn().map(a => ({ act: a[1], t: a[4] })));
  assert(acts.length >= 20, 'menu has only ' + acts.length + ' entries');
  const bad = [];
  for (const a of acts) {
    const e0 = errors.length, w0 = o.ctx.pages().length;
    const r = await p.evaluate(async a => { closeSheet(); const before = document.getElementById('view').innerHTML.length + '|' + tab;
      const b = document.createElement('button'); b.dataset.act = a.act; b.hidden = true; document.body.appendChild(b); b.click(); b.remove();
      await new Promise(r => setTimeout(r, 250));
      const sheet = !document.getElementById('sheetRoot').hidden, after = document.getElementById('view').innerHTML.length + '|' + tab;
      return sheet ? 'sheet' : before !== after ? 'view' : 'nothing'; }, a);
    let r2 = r; if (r === 'nothing') { await p.waitForTimeout(300); if (o.ctx.pages().length > w0) r2 = 'window'; }   // e.g. the emergency report opens in a new window
    for (const x of o.ctx.pages().slice(w0)) await x.close().catch(() => {});
    const err = errors.slice(e0);
    if (r2 === 'nothing' || err.length) bad.push(`«${a.t}» (${a.act}): ${r2}${err.length ? ' · ' + err.join(' | ').slice(0, 160) : ''}`);
  }
  await p.evaluate(() => { closeSheet(); goTab('home'); });
  return { n: acts.length, bad };
}

test('empty device: every menu entry opens', async () => {
  srv = await serve(); o = await launch(); await openApp(o, srv.url);
  const r = await openAll(o); assert(!r.bad.length, `${r.bad.length} of ${r.n} failed: ` + r.bad.join(' ; '));
});

test('after a synthetic business cycle: every menu entry opens', async () => {
  await seedFull(o.page);
  const r = await openAll(o); assert(!r.bad.length, `${r.bad.length} of ${r.n} failed: ` + r.bad.join(' ; '));
});

test('Help page opens and every catalogue entry shown has a description', async () => {
  const e0 = o.errors.length;
  const r = await o.page.evaluate(() => { closeSheet(); helpSheet(); const rows = [...document.querySelectorAll('#sheetRoot .row')];
    return { open: !document.getElementById('sheetRoot').hidden, n: rows.length, empty: rows.filter(x => !(x.querySelector('.sub') || {}).textContent.trim()).map(x => x.querySelector('.ttl').textContent),
      missing: CATALOG.flatMap(([, a]) => a).filter(([k]) => !HELP[k]).map(([k]) => k) }; });
  assert(!o.errors.slice(e0).length, o.errors.slice(e0).join(' | '));
  assert(r.open && r.n >= 20, 'help page did not open (' + r.n + ' rows)');
  assert(!r.empty.length && !r.missing.length, 'entries without help text: ' + r.empty.concat(r.missing).join(', '));
});

test('close', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
