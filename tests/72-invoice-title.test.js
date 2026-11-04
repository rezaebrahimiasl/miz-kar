// The title printed before the customer's name on an invoice («آقای» / «خانم» …) never contradicts a known first name:
// guessHon (known female → خانم, known male → آقای, unknown → no title), honFix in docHtml (either gender, also «حاج …»),
// the form recomputes the title when the person changes (a stored title is a starting value, not a choice), and a title chosen
// for a different printed name is not saved onto the person. The document viewer can send the page («ارسال»). Synthetic names only.
const { serve, launch, openApp, settle, submitForm, test, run, assert } = require('./lib');
let srv, o, p;
test('setup', async () => { srv = await serve(); o = await launch(); await openApp(o, srv.url); p = o.page;
  await p.evaluate(async () => { const n = nowTs(); for (const [id, name, hon] of [['pf', 'مریم آزمونی', 'خانم'], ['pm', 'محمود آزمونی', ''], ['pu', 'آرتین نمونه', ''], ['pc', 'شرکت آزمون', '']]) await putRaw('people', { id, name, ...(hon ? { hon } : {}), created: n, updated: n }); render(); }); });

test('guessHon: known female, known male, unknown name, company', async () => {
  const r = await p.evaluate(() => ['مریم آزمونی', 'سیده زهرا نمونه', 'محمود آزمونی', 'سید علی نمونه', 'آرتین نمونه', 'شرکت آزمون', ''].map(guessHon));
  assert(JSON.stringify(r) === JSON.stringify(['خانم', 'خانم', 'آقای', 'آقای', '—', '—', '—']), JSON.stringify(r));
});

test('printed title: a contradicting title is corrected for either gender; an unknown name keeps the chosen title', async () => {
  const r = await p.evaluate(() => { const to = (hon, toName) => { const h = docHtml({ id: 'x', type: 'invoice', no: 1, date: today(), hon, toName, items: [] }); return (h.match(/(حاج آقای|حاج خانم|آقای|خانم) [^<]*آزمونی|(حاج آقای|حاج خانم|آقای|خانم) [^<]*نمونه/) || [''])[0]; };
    return [to('خانم', 'محمود آزمونی'), to('آقای', 'مریم آزمونی'), to('حاج آقای', 'مریم آزمونی'), to('حاج خانم', 'محمود آزمونی'), to('خانم', 'آرتین نمونه'), to('آقای', 'آرتین نمونه')]; });
  assert(JSON.stringify(r) === JSON.stringify(['آقای محمود آزمونی', 'خانم مریم آزمونی', 'حاج خانم مریم آزمونی', 'حاج آقای محمود آزمونی', 'خانم آرتین نمونه', 'آقای آرتین نمونه']), JSON.stringify(r));
});

test('form: editing a document with a stored «خانم» and switching to a male customer recomputes the title', async () => {
  await p.evaluate(() => { closeSheet(); formDoc({ type: 'invoice', inv: true, personId: 'pf', hon: 'خانم', items: [] }); });
  await p.waitForSelector('#f_dhon', { state: 'attached' });
  const v0 = await p.evaluate(() => document.getElementById('f_dhon').value);
  await p.evaluate(() => { const s = document.getElementById('f_person'); s.value = 'pm'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  const v1 = await p.evaluate(() => document.getElementById('f_dhon').value);
  // a title the user picks stays
  await p.evaluate(() => { const h = document.getElementById('f_dhon'); h.value = 'دکتر'; h.dispatchEvent(new Event('change', { bubbles: true })); const s = document.getElementById('f_person'); s.value = 'pu'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  const v2 = await p.evaluate(() => document.getElementById('f_dhon').value);
  assert(v0 === 'خانم' && v1 === 'آقای' && v2 === 'دکتر', JSON.stringify({ v0, v1, v2 })); await p.evaluate(() => closeSheet());
});

test('saving: a title chosen for another printed name is not saved onto the person; for the person\'s own name it is', async () => {
  const run1 = async (toName, hon) => { await p.evaluate(([toName, hon]) => { closeSheet(); formDoc({ type: 'invoice', inv: true, personId: 'pm', toName, hon, led: 'receivable', items: [{ desc: 'خدمت آزمون', qty: 1, unit: 'خدمت', price: 1e6, src: 'svc' }] }); }, [toName, hon]);
    await p.waitForSelector('#sheetRoot form[data-form=doc]'); await p.evaluate(hon => { const h = document.getElementById('f_dhon'); h.value = hon; h.dispatchEvent(new Event('change', { bubbles: true })); }, hon);
    await submitForm(p); await settle(p); return p.evaluate(() => byId('people', 'pm').hon || ''); };
  const a = await run1('مریم آزمونی', 'خانم'); assert(a === '', 'title for another name saved on the person: ' + a);
  const b = await run1('', 'حاج آقای'); assert(b === 'حاج آقای', 'own title not saved: ' + b);
  assert(!o.errors.length, o.errors.join(' | '));
});
test('the document viewer has «ارسال»: the page goes to the share menu as a file with the document\'s name; print stays', async () => {
  const r = await p.evaluate(async () => { let got = null; Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true }); Object.defineProperty(navigator, 'share', { configurable: true, value: async x => { got = { name: x.files[0].name, type: x.files[0].type, txt: await x.files[0].text(), title: x.title }; } });
    const d = S.docs.find(x => !x.void && x.no); docPrint(d.id); const hv = document.getElementById('hv'); const btns = [...hv.querySelectorAll('[data-hv]')].map(b => b.dataset.hv);
    hv.querySelector('[data-hv=share]').click(); await new Promise(r => setTimeout(r, 200)); hv.querySelector('[data-hv=close]').click(); return { btns, got, no: String(d.no) }; });
  assert(r.btns.includes('print') && r.btns.includes('share') && r.got && /\.html$/.test(r.got.name) && r.got.type === 'text/html' && r.got.txt.includes('<html') && !/fonts\.googleapis/.test(r.got.txt), 'share: ' + JSON.stringify({ ...r, got: r.got && { ...r.got, txt: r.got.txt.length } }));
});
test('cleanup', async () => { await o.ctx.close(); await srv.close(); });
run(__filename);
