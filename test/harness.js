// SPDX-License-Identifier: MIT
// The test harness of Luccet's add-ons: the same file in every add-on
// repository (github.com/Luccet/<name>, test/harness.js); a change goes to
// all of them. It finds the engine, runs the Node tests, and serves the
// repository to Chromium and Firefox for the browser tests.
//
// The engine is an engine checkout (github.com/Luccet/luccet): LUCCET_ROOT,
// else ../luccet beside this repository. Its luccet.js and luccet.css are
// served as /luccet.js and /luccet.css (LUCCET_JS serves another build), and
// its command line runs the notes the tests write.
//
//   const h = require('./harness');
//   h.test(name, fn)               a Node test; fn may be async, return a note,
//                                  or throw h.Skip; h.runTests() runs them
//   h.cli(args, {cwd})             `luccet ARGS` from the engine: {code, out, err}
//   h.checkAndBuild(addon, note)   the add-on beside a note: luccet check finds
//                                  nothing, luccet build's page is returned
//   h.luccet                       the engine, required
//   h.runBrowser(TESTS, opts)      the browser tests (below)
//
// A browser test is {name, url, check(page, ctx)} with, optionally, setup
// (context, page, ctx), init (a page init script), browsers, timeout,
// readyTimeout, waitUntil, offline (only the site and the CDN copies
// answer), noLuccet (no luccet.ready to wait for), allowConsole (a regexp of
// console errors that do not fail it) or expectConsoleErrors. The page's
// window.__csp lists its policy violations. ctx holds
// browser, origin, diagnostics (luccet.diagnostics once ready), console,
// note(line) and skip(why). The site serves:
//
//   /luccet.js, /luccet.css        the engine's
//   /csp/…, /csp-nonce/…           the same paths under a strict policy that
//                                  allows https://cdn.jsdelivr.net (CSP, NONCE)
//   /gen/PATH                      opts.generated[PATH]() -> [type, body]
//   what opts.route(url) names     a file, for paths of the tests' own
//   anything else                  the repository's files; a folder's address
//                                  is its index.html, a page without its
//                                  extension the page
//
// CDN requests that match an entry of opts.cdn, [{re, dir(version)}], are
// answered from that package's local copy (tools/npm.js), so runs are
// deterministic and work offline after the first; --live-cdn uses the CDN.
//
//   node test/browser.js [--browsers=chromium,firefox] [--filter=TEXT] [--headed] [--live-cdn]
'use strict';

const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.resolve(process.env.LUCCET_ROOT || path.join(ROOT, '..', 'luccet'));
if (!fs.existsSync(path.join(ENGINE, 'luccet.js')) || !fs.existsSync(path.join(ENGINE, 'luccet-cli.js'))) {
  console.log(`✗ no Luccet engine at ${ENGINE}: set LUCCET_ROOT to a checkout of github.com/Luccet/luccet`);
  process.exit(2);
}
const LUCCET_JS = process.env.LUCCET_JS ? path.resolve(process.env.LUCCET_JS) : path.join(ENGINE, 'luccet.js');
const CLI = path.join(ENGINE, 'luccet-cli.js');
const luccet = require(LUCCET_JS);

const args = process.argv.slice(2);
const opt = (k) => (args.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || null;

class Skip extends Error {}

// ---------------------------------------------------------------- node

function cli(argv, { cwd = ROOT, env } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...argv], { cwd, encoding: 'utf8', env: { ...process.env, NODE_PATH: '', ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// A folder in the system's temporary folder, removed after fn, with an empty
// luccet.js: the notes' project for the command line, which their add-ons
// must stay inside.
async function inTemp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luccet-addon-'));
  fs.writeFileSync(path.join(dir, 'luccet.js'), '');
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// The add-on (a file of this repository) beside a note in a temporary
// folder, as a local add-on is: `luccet check` reports nothing and
// `luccet build` writes the page, which is returned. `files` are written
// beside it first ({name: text}).
async function checkAndBuild(addon, note, { use = path.basename(addon), files = {} } = {}) {
  return inTemp((dir) => {
    fs.copyFileSync(path.join(ROOT, addon), path.join(dir, path.basename(addon)));
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
    fs.writeFileSync(path.join(dir, 'n.html'), `<!doctype html><meta charset="utf-8"><title>T</title><script src="luccet.js" data-use="${use}"></script>\n\n${note}`);
    const check = cli(['check', 'n.html'], { cwd: dir });
    if (check.code !== 0 || !/0 errors, 0 warnings, 0 infos/.test(check.err)) throw new Error(`luccet check: ${check.out}${check.err}`);
    const build = cli(['build', 'n.html'], { cwd: dir });
    if (build.code !== 0) throw new Error(`luccet build: ${build.err}`);
    return build.out;
  });
}

async function runTests() {
  const filter = opt('filter');
  let failed = 0;
  let passed = 0;
  let skipped = 0;
  for (const t of tests) {
    if (filter && !t.name.includes(filter)) continue;
    try {
      const note = await t.fn();
      passed++;
      console.log(`✓ ${t.name}${note ? ` (${note})` : ''}`);
    } catch (e) {
      if (e instanceof Skip) {
        skipped++;
        console.log(`- ${t.name} (skipped: ${e.message})`);
        continue;
      }
      failed++;
      console.log(`✗ ${t.name}\n  ${(e && e.message) || e}`);
    }
  }
  console.log(`\n${passed}/${passed + failed} pass${skipped ? `; ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
}

// ---------------------------------------------------------------- the site

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};
const NONCE = 'luccet-addon-nonce';
const CSP = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:";
const CSP_NONCE = CSP.replace(/(script-src|style-src) 'self'/g, `$1 'self' 'nonce-${NONCE}'`);
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

function siteHandler(opts) {
  return (req, res) => {
    let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const headers = {};
    for (const [prefix, policy] of [['/csp/', CSP], ['/csp-nonce/', CSP_NONCE]]) {
      if (url.startsWith(prefix)) (url = url.slice(prefix.length - 1)), (headers['Content-Security-Policy'] = policy);
    }
    if (url.startsWith('/gen/') && opts.generated && opts.generated[url.slice(5)]) {
      const [type, body] = opts.generated[url.slice(5)]();
      res.writeHead(200, { ...headers, 'Content-Type': /^text\/|javascript|json/.test(type) ? `${type}; charset=utf-8` : type });
      return void res.end(body);
    }
    let file = url === '/luccet.js' ? LUCCET_JS : url === '/luccet.css' ? path.join(ENGINE, 'luccet.css') : (opts.route && opts.route(url)) || path.join(ROOT, path.normalize(url));
    if (url.endsWith('/') && fs.existsSync(path.join(file, 'index.html'))) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return void res.end('not found');
    }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { ...headers, 'Content-Type': /^text|javascript|json|svg/.test(type) ? `${type}; charset=utf-8` : type });
    res.end(fs.readFileSync(file));
  };
}

function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

// ---------------------------------------------------------------- packages

// A package's local copy, filled once from the npm registry (tools/npm.js),
// or null when it cannot be fetched (offline on the first run): the CDN then
// answers, and the run says so.
const copies = new Map();
function cached(label, dirOf, version) {
  const key = `${label}@${version}`;
  if (!copies.has(key))
    copies.set(
      key,
      Promise.resolve()
        .then(() => dirOf(version))
        .catch((e) => {
          console.log(`    (${label} ${version} not cached, so the live CDN answers: ${e.message})`);
          return null;
        }),
    );
  return copies.get(key);
}

// Answers a package's CDN requests from its copy; what the copy lacks goes on to the CDN.
async function routeCdn(context, { re, dir }) {
  await context.route(
    (url) => re.test(url.href),
    async (route) => {
      const [, version, rel] = re.exec(route.request().url());
      const d = await cached(String(re), dir, version);
      const file = d && path.join(d, path.normalize(rel));
      if (!file || !file.startsWith(d + path.sep) || !fs.existsSync(file)) return route.continue();
      await route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' } }).catch(() => {}); // the context closed
    },
  );
}

// ---------------------------------------------------------------- the browser

async function expect(page, fn, what, timeout = 8000, arg) {
  try {
    await page.waitForFunction(fn, arg, { timeout });
  } catch {
    throw new Error(`expected ${what}`);
  }
}

// Playwright from this repository's node_modules, else the engine's.
function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    for (const from of [ROOT, ENGINE]) {
      try {
        return require(require.resolve(name, { paths: [from] }));
      } catch {}
    }
  }
  return null;
}

async function waitForReady(page, t, ctx) {
  ctx.step = 'waiting for luccet.ready';
  try {
    await page.waitForFunction(() => window.luccet && window.luccet.ready, null, { timeout: t.readyTimeout || 10000 });
  } catch {
    throw new Error('expected window.luccet.ready: luccet.js did not run');
  }
  await page.evaluate(() => window.luccet.ready.then(() => (window.__luccetReady = 'yes'), (e) => (window.__luccetReady = `rejected: ${e}`)));
  await expect(page, () => window.__luccetReady, 'luccet.ready to settle', t.readyTimeout || 10000);
  const settled = await page.evaluate(() => window.__luccetReady);
  if (settled !== 'yes') throw new Error(`luccet.ready ${settled}`);
  ctx.diagnostics = await page.evaluate(() => JSON.parse(JSON.stringify(window.luccet.diagnostics || [])));
}

async function runTest(browser, origin, t, opts) {
  const context = await browser.newContext(t.context || {});
  const consoleErrors = [];
  const ctx = {
    browser: browser.browserType().name(),
    origin,
    diagnostics: [],
    console: [],
    notes: [],
    step: 'opening the page',
    note: (line) => ctx.notes.push(line),
    skip: (why) => {
      throw new Skip(why);
    },
  };
  const cdn = opts.cdn || [];
  const run = (async () => {
    if (!args.includes('--live-cdn')) for (const c of cdn) await routeCdn(context, c);
    if (t.offline) await context.route((url) => url.origin !== origin && !cdn.some((c) => c.re.test(url.href)), (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }));
    const page = await context.newPage();
    page.on('console', (m) => {
      ctx.console.push({ type: m.type(), text: m.text() });
      if (m.type() === 'error' && !(t.allowConsole && t.allowConsole.test(m.text()))) consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    await page.addInitScript(() => {
      window.__csp = []; // the policy violations, for a test under /csp/ or /csp-nonce/
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    if (t.init) await page.addInitScript(t.init);
    if (t.setup) await t.setup(context, page, ctx);
    await page.goto(origin + t.url, { waitUntil: t.waitUntil || 'load', timeout: t.readyTimeout || 30000 });
    if (!t.noLuccet) await waitForReady(page, t, ctx);
    ctx.step = 'checking';
    await t.check(page, ctx);
    if (!t.expectConsoleErrors && consoleErrors.length) throw new Error(`console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
  })();
  run.catch(() => {}); // after a timeout, closing the context rejects what was pending
  const ms = t.timeout || 30000;
  let timer;
  try {
    await Promise.race([run, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000} s while ${ctx.step}`)), ms)))]);
  } catch (e) {
    if (!(e instanceof Skip) && consoleErrors.length && !/^console errors/.test(e.message)) e.message += ` [console: ${consoleErrors.slice(0, 2).join(' | ').slice(0, 300)}]`;
    e.notes = ctx.notes;
    throw e;
  } finally {
    clearTimeout(timer);
    await context.close().catch(() => {});
  }
  return ctx.notes;
}

async function runBrowser(TESTS, opts = {}) {
  const pw = loadPlaywright();
  if (!pw) {
    console.log('✗ playwright is not installed: npm install && npx playwright install chromium firefox');
    process.exit(2);
  }
  const site = await serve(siteHandler(opts));
  const count = { passed: 0, failed: 0, skipped: 0 };
  const filter = opt('filter');
  const show = (lines) => (lines || []).forEach((l) => console.log(`      ${l}`));
  try {
    for (const name of (opt('browsers') || 'chromium,firefox').split(',')) {
      let browser;
      try {
        browser = await pw[name].launch({ headless: !args.includes('--headed') });
      } catch (e) {
        count.failed++;
        console.log(`✗ ${name}: cannot launch (${e.message.split('\n')[0]}); npx playwright install ${name}`);
        continue;
      }
      console.log(`${name} ${browser.version()}`);
      for (const t of TESTS) {
        if ((filter && !t.name.includes(filter)) || (t.browsers && !t.browsers.includes(name))) continue;
        try {
          const lines = await runTest(browser, site.origin, t, opts);
          count.passed++;
          console.log(`  ✓ ${t.name}`);
          show(lines);
        } catch (e) {
          if (e instanceof Skip) {
            count.skipped++;
            console.log(`  - ${t.name} (skipped: ${e.message})`);
            continue;
          }
          count.failed++;
          console.log(`  ✗ ${t.name}: ${e.message.split('\n')[0]}`);
          show(e.notes);
        }
      }
      await browser.close();
    }
  } finally {
    site.server.close();
  }
  console.log(`\n${count.failed ? `${count.failed} failure(s), ` : ''}${count.passed} passed${count.skipped ? `; ${count.skipped} skipped` : ''}`);
  process.exit(count.failed ? 1 : 0);
}

module.exports = { ROOT, ENGINE, CLI, LUCCET_JS, luccet, Skip, test, assert, cli, inTemp, checkAndBuild, runTests, runBrowser, expect, NONCE, CSP, PNG_1PX, TYPES, cached };
