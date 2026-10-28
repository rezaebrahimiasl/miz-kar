// O2 static checks on the service worker's shell rules (no browser, < 1 s): which URLs are the shell, and what counts as the app.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { ROOT, test, run, assert } = require('./lib');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), APP = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const DECL = /const APP_VER='\d+(?:\.\d+)*';/;
// Load sw.js as the browser would for a given scope and return its shell helpers (null when they do not exist).
function helpers(scope) {
  const self = { location: new URL('sw.js', scope), addEventListener() {}, skipWaiting() {}, clients: { claim() {} } };
  const ctx = vm.createContext({ self, caches: {}, fetch() {}, Response: class {}, URL, console });
  return vm.runInContext(SW + '\n;({ isShellUrl: typeof isShellUrl === "function" ? isShellUrl : null, isApp: typeof isApp === "function" ? isApp : null })', ctx);
}

for (const scope of ['https://example.github.io/miz-kar/', 'http://127.0.0.1:8080/']) {
  test(`isShellUrl() matches only the app shell in scope ${new URL(scope).pathname}`, () => {
    const { isShellUrl } = helpers(scope); assert(isShellUrl, 'sw.js defines no isShellUrl()');
    const P = new URL(scope).pathname, yes = [P, P + 'index.html', P + '?share=1', P + 'index.html?fresh=123', P + 'index.html#x'];
    const no = [P + 'login/', P + 'foo/', P + 'foo/index.html', P + 'index.html.bak', P + 'sw.js', P + 'version.json', P + 'docs/', '/login/', '/other-app/index.html'];
    const wrong = [...yes.filter(u => !isShellUrl(new URL(u, scope).href)).map(u => 'not matched: ' + u), ...no.filter(u => isShellUrl(new URL(u, scope).href)).map(u => 'wrongly matched: ' + u)];
    assert(!wrong.length, wrong.join(' · '));
  });
}

test('isApp() accepts the real index.html and rejects everything else, including its own source', () => {
  const { isApp } = helpers('http://127.0.0.1:8080/'); assert(isApp, 'sw.js defines no isApp()');
  const cases = [
    ['real repository index.html', APP, true],
    ['index.html with only the APP_VER declaration removed', APP.replace(DECL, ''), false],
    ['sw.js source (contains the validation code itself)', SW, false],
    ['the bare text const APP_VER=\' with no version', "<html>const APP_VER='</html>", false],
    ['an unrelated sign-in page', '<!doctype html><title>Wi-Fi login</title><h1>sign in</h1>', false],
    ['empty text', '', false]];
  const wrong = cases.filter(([, t, want]) => !!isApp(t) !== want).map(([n, , want]) => `${n}: expected ${want}`);
  assert(DECL.test(APP), 'repository index.html has no version declaration');
  assert(!wrong.length, wrong.join(' · '));
});

test("index.html's own validation code does not count as the app (no self-validation)", () => {
  const { isApp } = helpers('http://127.0.0.1:8080/'); assert(isApp, 'sw.js defines no isApp()');
  const i = APP.indexOf('async function stashLatest'); assert(i >= 0, 'stashLatest not found');
  const src = APP.slice(i, APP.indexOf('\n', i)); assert(!isApp(src), 'the stashLatest source line alone is accepted as the app');
  assert(!DECL.test(src), 'stashLatest source contains a literal version declaration');
});
run(__filename);
