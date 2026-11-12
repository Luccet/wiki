#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// The examples in Chromium and Firefox (test/harness.js), as a reader opens
// them over HTTP: the front page lists the notes and searches them, a hit
// opening its section; the glossary page lists the terms the notes define;
// every :term in the notes links to an entry it lists. They read the index
// files committed beside them.
//
//   LUCCET_ROOT=…/luccet node test/examples/browser.js [--browsers=…] [--filter=TEXT]
'use strict';

const fs = require('fs');
const path = require('path');
const h = require('../harness');

const read = (name) => JSON.parse(fs.readFileSync(path.join(h.ROOT, 'examples', name), 'utf8'));

// The examples load the engine and a theme from cdn.luccet.dev, as a
// reader's copy does. Here the engine is the checkout's, which the site
// serves as /luccet.js and /luccet.css, and the theme an empty stylesheet:
// the look is not under test. Any other request to cdn.luccet.dev fails.
async function fromCdn(context, origin) {
  await context.route(/^https:\/\/cdn\.luccet\.dev\//, async (route) => {
    const url = route.request().url();
    const engine = /^https:\/\/cdn\.luccet\.dev\/v2\/(luccet\.(?:js|css))$/.exec(url);
    if (engine) return route.fulfill({ response: await route.fetch({ url: `${origin}/${engine[1]}` }) });
    if (/^https:\/\/cdn\.luccet\.dev\/themes\/v1\/[\w-]+\.css$/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
}

// Another example, once the first is open: luccet.ready settled, nothing
// diagnosed.
async function open(page, origin, name) {
  await page.goto(`${origin}/examples/${name}`);
  await h.expect(page, () => window.luccet && window.luccet.ready, `luccet.js to run on ${name}`, 10000);
  await page.evaluate(() => window.luccet.ready);
  const diagnostics = await page.evaluate(() => JSON.parse(JSON.stringify(window.luccet.diagnostics || [])));
  if (diagnostics.length) throw new Error(`${name}: diagnostics ${JSON.stringify(diagnostics)}`);
}

// A link's address from the examples' folder: baking.html#crumb.
const fromExamples = () => (href) => {
  const u = new URL(href, location.href);
  return u.pathname.replace(/^.*\/examples\//, '') + u.hash;
};

const TESTS = [
  {
    name: 'examples/index.html: ::notes lists the notes newest first, the front page left out; ::search reads search.json, finds a word, and Enter opens the first hit at its section',
    url: '/examples/index.html',
    setup: (context, page, ctx) => fromCdn(context, ctx.origin),
    async check(page, ctx) {
      await h.expect(page, () => document.querySelector('.t-notes-list') && !/Indexing/.test(document.querySelector('.t-search-status').textContent), 'the list and the search to be ready', 15000);
      const rel = await page.evaluateHandle(fromExamples);
      const list = await page.evaluate((rel) => [...document.querySelectorAll('.t-notes-list > li')].map((li) => [rel(li.querySelector('.t-notes-title').href), li.querySelector('.t-notes-title').textContent, (li.querySelector('time.t-notes-date') || {}).textContent || '', (li.querySelector('.t-notes-desc') || {}).textContent || '']), rel);
      const want = [
        ['baking.html', 'Baking day', '2026-10-18'],
        ['fermentation.html', 'Bulk fermentation and the proof', '2026-10-03'],
        ['hydration.html', "Hydration and baker's percentages", '2026-09-21'],
        ['starter.html', 'Keeping a starter', '2026-09-14'],
        ['glossary.html', 'Glossary', '2026-09-12'],
      ];
      if (JSON.stringify(list.map((n) => n.slice(0, 3))) !== JSON.stringify(want)) throw new Error(`the list ${JSON.stringify(list)}, expected the notes newest first with their dates, index.html left out`);
      if (!list.every((n) => n[3])) throw new Error(`a note without its description: ${JSON.stringify(list)}`);

      const index = read('search.json');
      const status = () => page.evaluate(() => document.querySelector('.t-search-status').textContent);
      if ((await status()) !== `${index.notes.length} notes, ${index.entries.length} entries`) throw new Error(`the search's status "${await status()}", expected search.json's counts`);
      await page.fill('.t-search-box', 'crumb');
      await h.expect(page, () => /result/.test(document.querySelector('.t-search-status').textContent), 'results for "crumb"');
      const hits = await page.evaluate((rel) => [...document.querySelectorAll('.t-search-results > li')].map((li) => ({ href: rel(li.querySelector('a').href), title: li.querySelector('.t-search-title').textContent, page: li.querySelector('.t-search-page').textContent, marks: [...li.querySelectorAll('mark')].map((m) => m.textContent.toLowerCase()) })), rel);
      if (!hits.length || hits[0].href !== 'baking.html#crumb' || hits[0].title !== 'The crumb' || hits[0].page !== 'Baking day') throw new Error(`the first hit for "crumb": ${JSON.stringify(hits[0])}, expected Baking day's section on the crumb`);
      const where = hits.map((x) => x.href).sort().join(' ');
      if (where !== 'baking.html#crumb fermentation.html#proof hydration.html#hydration') throw new Error(`the hits for "crumb": ${where}`);
      if (!hits.every((x) => x.marks.length && x.marks.every((m) => m === 'crumb'))) throw new Error(`the marked words: ${JSON.stringify(hits)}`);
      if ((await page.evaluate(() => location.search)) !== '?q=crumb') throw new Error('the URL does not keep the query');
      if (ctx.diagnostics.length) throw new Error(`diagnostics ${JSON.stringify(ctx.diagnostics)}`);

      await page.press('.t-search-box', 'Enter');
      await page.waitForURL(/\/examples\/baking\.html#crumb$/, { timeout: 10000 });
      await h.expect(page, () => window.luccet && window.luccet.ready && document.getElementById('crumb'), 'the note to show its section on the crumb', 10000);
    },
  },
  {
    name: 'examples/glossary.html: ::glossary lists the terms the notes define, each linked to its definition, which reads as on its page; its source names the note',
    url: '/examples/glossary.html',
    setup: (context, page, ctx) => fromCdn(context, ctx.origin),
    async check(page, ctx) {
      const file = read('glossary.json');
      await h.expect(page, (n) => document.querySelectorAll('.t-glossary-list > dt').length === n && [...document.querySelectorAll('.t-glossary-definition')].every((d) => d.textContent.trim()), 'the terms and their definitions', 15000, file.terms.length);
      const rel = await page.evaluateHandle(fromExamples);
      const r = await page.evaluate((rel) => ({
        entries: [...document.querySelectorAll('.t-glossary-list > dt')].map((dt) => {
          const dd = dt.nextElementSibling;
          return [dt.id, dt.textContent, rel(dt.querySelector('a').href), dd.querySelector('.t-glossary-definition').textContent.replace(/\s+/g, ' ').trim(), dd.querySelector('.t-glossary-source').textContent];
        }),
        uses: [...document.querySelectorAll('.t-glossary-definition .term > a')].map((a) => rel(a.href).replace(/#.*$/, '')),
      }), rel);
      const titles = new Map(file.notes.map((n) => [n.url, n.title]));
      const want = file.terms.map((t) => [t.slug, t.term, `${t.url}#${t.id}`, `From ${titles.get(t.url)}`]);
      const got = r.entries.map((e) => [e[0], e[1], e[2], e[4]]);
      if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`the entries ${JSON.stringify(got)}, expected glossary.json's: ${JSON.stringify(want)}`);
      if (got.map((e) => e[1]).join(', ') !== "autolyse, Baker's percentage, bulk fermentation, crumb, hydration, levain, Oven spring, proof, Scoring, starter") throw new Error(`the terms ${got.map((e) => e[1]).join(', ')}`);
      const definition = (term) => (r.entries.find((e) => e[1] === term) || [])[3];
      // An inline :definition[…] ends the definition where its paragraph goes on.
      if (definition('levain') !== 'A levain is a portion of the starter, fed for one bake and used up in it.') throw new Error(`the levain's definition: ${JSON.stringify(definition('levain'))}`);
      // A titled :::definition block: its body, without its title.
      if (!/^An ingredient's weight as a share of the flour's/.test(definition("Baker's percentage"))) throw new Error(`the baker's percentage's definition: ${JSON.stringify(definition("Baker's percentage"))}`);
      // A dfn in a heading: the paragraph after it.
      if (definition('crumb') !== 'The inside of the loaf: the bread around its holes.') throw new Error(`the crumb's definition: ${JSON.stringify(definition('crumb'))}`);
      if (!r.uses.length || !r.uses.every((u) => u === 'glossary.html')) throw new Error(`the uses in the definitions link to ${JSON.stringify(r.uses)}, expected this page`);
      if (ctx.diagnostics.length) throw new Error(`diagnostics ${JSON.stringify(ctx.diagnostics)}`);
    },
  },
  {
    name: "examples/*.html: every :term links to its entry on the glossary page, title= for an inflected use; following one lands on the entry",
    url: '/examples/starter.html',
    setup: (context, page, ctx) => fromCdn(context, ctx.origin),
    async check(page, ctx) {
      const want = {
        'starter.html': ['hydration→glossary.html#glossary-hydration'],
        'hydration.html': ['levain→glossary.html#glossary-levain', 'crumb→glossary.html#glossary-crumb', 'bulk fermentation→glossary.html#glossary-bulk-fermentation'],
        'baking.html': ['bulk fermentation→glossary.html#glossary-bulk-fermentation', 'hydration→glossary.html#glossary-hydration'],
        'fermentation.html': ['levain→glossary.html#glossary-levain', 'hydration→glossary.html#glossary-hydration', 'score→glossary.html#glossary-scoring', 'crumb→glossary.html#glossary-crumb'],
      };
      const slugs = new Set();
      for (const name of Object.keys(want)) {
        if (name !== 'starter.html') await open(page, ctx.origin, name);
        await h.expect(page, () => [...document.querySelectorAll('main.luccet .term > a')].every((a) => a.hash), `${name}: the uses' entries`);
        const rel = await page.evaluateHandle(fromExamples);
        const uses = await page.evaluate((rel) => [...document.querySelectorAll('main.luccet .term > a')].map((a) => `${a.textContent}→${rel(a.href)}`), rel);
        if (JSON.stringify(uses) !== JSON.stringify(want[name])) throw new Error(`${name}: the uses ${JSON.stringify(uses)}, expected ${JSON.stringify(want[name])}`);
        for (const u of uses) slugs.add(u.replace(/^.*#/, ''));
      }
      if (ctx.diagnostics.length) throw new Error(`diagnostics ${JSON.stringify(ctx.diagnostics)}`);
      // fermentation.html is open: follow its inflected use.
      await page.click('main.luccet .term > a[href$="#glossary-scoring"]');
      await page.waitForURL(/\/examples\/glossary\.html#glossary-scoring$/, { timeout: 10000 });
      await h.expect(page, () => window.luccet && document.querySelector('.t-glossary-list'), 'the glossary page to list its terms', 15000);
      const ids = await page.evaluate(() => [...document.querySelectorAll('.t-glossary-list > dt')].map((dt) => dt.id));
      const missing = [...slugs].filter((s) => !ids.includes(s));
      if (missing.length) throw new Error(`no entry for ${missing.join(', ')}; the entries are ${ids.join(', ')}`);
      const entry = await page.evaluate(() => (document.getElementById('glossary-scoring') || {}).textContent);
      if (entry !== 'Scoring') throw new Error(`the entry the use leads to reads ${JSON.stringify(entry)}`);
    },
  },
];

h.runBrowser(TESTS);
