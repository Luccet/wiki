#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// search.js in Chromium and Firefox (test/harness.js): the linked notes
// indexed in the browser, hits linking to their block, the keyboard;
// from=, ?q=, limit and placeholder; index= reading the search.json the
// engine's `luccet index` writes; a page reached as its folder or without its
// extension left out; the page's own words; and an index's entries that are
// no page of the site, a malformed index= and an index of another format.
//
//   LUCCET_ROOT=…/luccet node test/search/browser.js [--browsers=…] [--filter=TEXT]
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const h = require('../harness');

// test/search/pages/search/ copied to a temporary folder and indexed there with
// `luccet index`, so search.json sits beside the notes without being
// written into the repository; served as /gen/indexed/. Once.
let indexed = null;
function indexedDir() {
  if (indexed) return indexed;
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'luccet-search-indexed-')), 'search');
  fs.cpSync(path.join(h.ROOT, 'test', 'search', 'pages', 'search'), dir, { recursive: true });
  const r = h.cli(['index', dir, '--all']);
  if (r.code !== 0) throw new Error(`luccet index exited ${r.code}: ${r.err.trim()}`);
  return (indexed = dir);
}

// An index as luccet index never writes one: entries whose URLs are no
// page of the site, beside one that is; one of a format before 1; and two
// leaves whose index= is no URL. Served as /gen/bad-index/.
function badIndexPage() {
  return [
    '<!doctype html><meta charset="utf-8"><title>A crafted index</title><script src="/luccet.js" data-use="/search.js"></script>',
    '',
    ':::meta',
    'robots: noindex',
    ':::',
    '',
    '# URLs an index may not hold',
    '',
    '::search{#box index=search.json}',
    '',
    'One written before the format (0.x), with no note to fall back to (notes= names this page alone):',
    '',
    '::search{#old index=old.json notes=index.html}',
    '',
    'One whose index= is no URL:',
    '',
    '::search{#bad index="http://[bad"}',
    '',
  ].join('\n');
}
function badIndex() {
  const entry = (url, label) => ({ url, id: 'h', kind: 'heading', label, title: '', text: 'alpha text' });
  const entries = [entry('good.html', 'Alpha good'), entry('javascript:alert(1)//', 'Alpha script'), entry('data:text/html,<script>alert(1)</script>', 'Alpha data'), entry('https://other.example/x.html', 'Alpha elsewhere'), entry('//other.example/y.html', 'Alpha protocol-relative')];
  return {
    search: { luccet: h.luccet.version, format: h.luccet.search.format, notes: entries.map((e) => ({ url: e.url, title: e.label })), entries, terms: { alpha: entries.map((_, i) => [i, 3]), text: entries.map((_, i) => [i, 1]) }, lengths: entries.map(() => 2), avg: 2 },
    old: { luccet: '0.5.0', notes: [], entries: [], terms: {}, lengths: [], avg: 0 },
  };
}

const TESTS = [
  {
    name: 'the linked notes are indexed, hits link to their block, a missing note is counted, nothing else is fetched; the arrow keys walk the hits',
    url: '/test/search/pages/search/index.html',
    allowConsole: /Failed to load resource/,
    async setup(_context, page, ctx) {
      ctx.fetched = [];
      page.on('request', (r) => r.resourceType() !== 'document' && /\/test\/search\/pages\/search\//.test(r.url()) && ctx.fetched.push(r.url().replace(/^.*\/search\//, '')));
    },
    async check(page, ctx) {
      const status = () => page.evaluate(() => document.querySelector('.t-search-status').textContent);
      await h.expect(page, () => !/Indexing/.test(document.querySelector('.t-search-status').textContent), 'the index to build');
      if ((await status()) !== '2 notes, 5 entries; 1 could not be read') throw new Error(`status "${await status()}"`);
      const hits = async (q) => {
        await page.fill('.t-search-box', q);
        await page.waitForTimeout(250);
        return page.evaluate(() => [...document.querySelectorAll('.t-search-results > li')].map((li) => ({
          title: li.querySelector('.t-search-title').textContent,
          page: li.querySelector('.t-search-page').textContent,
          href: li.querySelector('a').getAttribute('href').replace(/^.*\/search\//, ''),
          snippet: li.querySelector('.t-search-snippet').textContent,
          marks: [...li.querySelectorAll('mark')].map((m) => m.textContent),
        })));
      };
      let r = await hits('pythag');
      if (r.length !== 1) throw new Error(`"pythag": ${JSON.stringify(r)}, expected the one exercise`);
      if (r[0].title !== 'Exercise 1 I.1' || r[0].page !== 'Alpha: triangles' || r[0].href !== 'alpha.html#ex-1') throw new Error(`"pythag" hit ${JSON.stringify(r[0])}`);
      if (r[0].marks.join() !== 'Pythagoras' || !/using squares/.test(r[0].snippet)) throw new Error(`"pythag" snippet ${JSON.stringify(r[0])}: expected Pythagoras marked and the hard break read as a space`);
      r = await hits('triangle');
      if (r[0].href !== 'alpha.html#tri' || r[0].title !== 'Triangles') throw new Error(`"triangle" first hit ${JSON.stringify(r[0])}, expected the heading (a title hit weighs more)`);
      if (!r.some((x) => x.href === 'beta.html#ex-3') || !r.some((x) => x.href === 'alpha.html#ex-2')) throw new Error(`"triangle" hits ${JSON.stringify(r.map((x) => x.href))}`);
      r = await hits('sqrt');
      if (r.length !== 1 || r[0].href !== 'alpha.html#tri' || r[0].marks.join() !== 'sqrt') throw new Error(`"sqrt" (TeX as written) ${JSON.stringify(r)}`);
      r = await hits('circumference');
      if (r.length !== 2 || r[0].href !== 'beta.html#circ') throw new Error(`"circumference" ${JSON.stringify(r.map((x) => x.href))}, expected beta's section first (shorter) then alpha's exercise`);
      r = await hits('nothingofthesort');
      if (r.length || (await status()) !== 'No results') throw new Error(`a miss: ${JSON.stringify(r)}, status "${await status()}"`);
      await page.fill('.t-search-box', 'circle');
      await page.waitForTimeout(250);
      if ((await page.evaluate(() => location.search)) !== '?q=circle') throw new Error('the URL after typing is not ?q=circle');
      const fetched = [...new Set(ctx.fetched)].sort();
      if (fetched.join() !== 'alpha.html,beta.html,missing.html,vocab.js') throw new Error(`fetched ${fetched.join(', ')}: expected the two notes and the missing one, not hidden.html or notes.txt`);
      await page.fill('.t-search-box', 'circumference');
      // The query in the URL: its search ran (the previous one may have had two hits too).
      await h.expect(page, () => location.search === '?q=circumference' && document.querySelectorAll('.t-search-results a').length === 2, 'two hits to walk');
      await page.focus('.t-search-box');
      const active = () => page.evaluate(() => (document.activeElement.matches('.t-search-box') ? 'box' : document.activeElement.matches('.t-search-results a') ? `hit ${[...document.querySelectorAll('.t-search-results a')].indexOf(document.activeElement) + 1}` : document.activeElement.localName));
      const walk = [];
      for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'Escape', 'ArrowUp']) {
        await page.keyboard.press(key);
        walk.push(await active());
      }
      if (walk.join() !== 'hit 1,hit 2,hit 2,hit 1,box,hit 1,box,box') throw new Error(`the arrow keys walked ${walk.join(', ')}`);
      if (!ctx.console.some((m) => m.type === 'warning' && /missing\.html could not be fetched/.test(m.text))) throw new Error('no warning for missing.html');
      if (ctx.diagnostics.length) throw new Error(`diagnostics ${JSON.stringify(ctx.diagnostics)}`);
    },
  },
  {
    name: "from= takes another page's links, ?q= fills the box, limit and placeholder apply, Enter opens the first hit",
    url: '/test/search/pages/search-from.html?q=pi',
    allowConsole: /Failed to load resource/,
    async check(page) {
      await h.expect(page, () => /result/.test(document.querySelector('.t-search-status').textContent), 'the prefilled query to run');
      await h.expect(page, () => /result/.test(document.querySelectorAll('.t-search-status')[1].textContent), 'the second box too');
      const r = await page.evaluate(() => ({
        status: document.querySelector('.t-search-status').textContent,
        value: document.querySelector('.t-search-box').value,
        placeholder: document.querySelector('.t-search-box').placeholder,
        hrefs: [...document.querySelectorAll('.t-search-results a')].map((a) => a.getAttribute('href').replace(/^.*\/search\//, '')),
        role: document.querySelector('search.t-search').getAttribute('role'),
        list: [...document.querySelectorAll('.t-search-results')].map((ol) => [ol.getAttribute('role'), ol.getAttribute('aria-live')]),
        none: { status: document.querySelectorAll('.t-search-status')[1].textContent, items: document.querySelectorAll('.t-search-results')[1].children.length },
      }));
      if (r.status !== '1 result' || r.value !== 'pi' || r.placeholder !== 'Find an exercise') throw new Error(JSON.stringify(r));
      if (r.hrefs.join() !== 'beta.html#circ') throw new Error(`hits ${r.hrefs.join()}, expected beta's section alone (limit=1)`);
      if (r.role !== 'search') throw new Error(`the element is ${r.role}`);
      if (JSON.stringify(r.list) !== JSON.stringify([['list', null], ['list', null]])) throw new Error(`the results lists: ${JSON.stringify(r.list)}, expected role=list and no live region of their own`);
      if (r.none.status !== '1 result, none listed' || r.none.items) throw new Error(`limit=0: ${JSON.stringify(r.none)}`);
      // Enter right after typing, before the debounce ran: the query as typed is run first, and its first hit opened.
      await page.evaluate(() => {
        const box = document.querySelector('.t-search-box');
        box.value = 'pythag';
        box.dispatchEvent(new Event('input', { bubbles: true }));
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      });
      await page.waitForURL(/alpha\.html#ex-1$/, { timeout: 5000 });
    },
  },
  {
    name: 'index= reads the search.json luccet index wrote, fetching no note, hits resolving from the file; an index that cannot be loaded falls back to indexing here',
    url: '/gen/indexed/indexed.html',
    allowConsole: /Failed to load resource/,
    async setup(_context, page, ctx) {
      ctx.fetched = [];
      page.on('request', (r) => r.resourceType() !== 'document' && /\/gen\/indexed\//.test(r.url()) && ctx.fetched.push(r.url().replace(/^.*\/indexed\//, '')));
    },
    async check(page, ctx) {
      const status = (sel) => page.evaluate((sel) => document.querySelector(`${sel} .t-search-status`).textContent, sel);
      await h.expect(page, () => ['#pre', '#live'].every((s) => document.querySelector(`${s} .t-search-status`) && !/Indexing/.test(document.querySelector(`${s} .t-search-status`).textContent)), 'both boxes to be ready');
      if ((await status('#pre')) !== '4 notes, 7 entries') throw new Error(`status "${await status('#pre')}", expected the index's four notes, the noindex pages left out`);
      if ((await status('#live')) !== '1 note, 3 entries') throw new Error(`the fallback's status "${await status('#live')}", expected alpha.html indexed here`);
      await page.fill('#pre .t-search-box', 'pythag');
      await page.waitForTimeout(250);
      const hits = await page.evaluate(() => [...document.querySelectorAll('#pre .t-search-results > li')].map((li) => ({
        title: li.querySelector('.t-search-title').textContent,
        page: li.querySelector('.t-search-page').textContent,
        href: li.querySelector('a').getAttribute('href').replace(/^.*\/indexed\//, ''),
        marks: [...li.querySelectorAll('mark')].map((m) => m.textContent),
      })));
      if (hits.length !== 2 || hits[0].href !== 'alpha.html#ex-1' || hits[1].href !== 'hidden.html#no') throw new Error(`"pythag": ${JSON.stringify(hits)}, expected the exercise then the hidden note's section`);
      if (hits[0].title !== 'Exercise 1 I.1' || hits[0].page !== 'Alpha: triangles' || hits[0].marks.join() !== 'Pythagoras') throw new Error(`the first hit ${JSON.stringify(hits[0])}`);
      const fetched = [...new Set(ctx.fetched)].sort();
      if (fetched.join() !== 'alpha.html,missing.json,search.json,vocab.js') throw new Error(`fetched ${fetched.join(', ')}: expected the index, the missing index, and alpha.html for the fallback box only`);
      if (!ctx.console.some((m) => m.type === 'warning' && /missing\.json could not be loaded/.test(m.text))) throw new Error('no warning for missing.json');
      if (ctx.diagnostics.length) throw new Error(`diagnostics ${JSON.stringify(ctx.diagnostics)}`);
      await page.focus('#pre .t-search-box');
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/gen\/indexed\/alpha\.html#ex-1$/, { timeout: 5000 });
    },
  },
  ...[
    ['a page reached as its folder (folder/) is the index.html its links name, and is left out', '/test/search/pages/folder/', /\/folder\/$/],
    ['a page reached without its extension (folder/plain) is the plain.html its links name, and is left out', '/test/search/pages/folder/plain', /\/folder\/plain$/],
  ].map(([name, url, at]) => ({
    name,
    url,
    async check(page, ctx) {
      await h.expect(page, () => document.querySelector('.t-search-status') && !/Indexing/.test(document.querySelector('.t-search-status').textContent), 'the box to settle');
      const r = await page.evaluate(() => ({ href: location.href, search: document.querySelector('.t-search-status').textContent }));
      if (!at.test(r.href)) throw new Error(`the page is at ${r.href}`);
      if (!/^1 note\b/.test(r.search)) throw new Error(`the status "${r.search}", expected the post alone indexed, this page left out`);
      if (ctx.diagnostics.length) throw new Error(`diagnostics ${JSON.stringify(ctx.diagnostics)}`);
    },
  })),
  {
    name: "window.LUCCET.strings: the search box speaks the page's words, luccet.string with them",
    url: '/test/search/pages/strings.html',
    allowConsole: /Failed to load resource/,
    async check(page) {
      await h.expect(page, () => document.querySelector('.t-search-status') && !/Indizieren/.test(document.querySelector('.t-search-status').textContent), 'the box to settle');
      await page.fill('.t-search-box', 'zzzz');
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => ({
        placeholder: document.querySelector('.t-search-box').placeholder,
        status: document.querySelector('.t-search-status').textContent,
        api: window.luccet.string('results', { n: 1 }) + ' / ' + window.luccet.string('nothing', { n: 2 }, '{n} thing|{n} things'),
      }));
      if (r.placeholder !== 'Notizen durchsuchen' || r.status !== 'Keine Treffer') throw new Error(`the search box: ${JSON.stringify([r.placeholder, r.status])}`);
      if (r.api !== '1 Treffer / 2 things') throw new Error(`luccet.string: ${r.api}`);
      await page.fill('.t-search-box', '');
      await page.waitForTimeout(250);
      const ready = await page.evaluate(() => document.querySelector('.t-search-status').textContent);
      if (ready !== '1 Notiz, 3 Einträge') throw new Error(`the ready line: ${ready}`);
    },
  },
  {
    name: "an index entry whose URL is javascript:, data:, another site or a protocol-relative one is left out with a warning; the site's own page stays",
    url: '/gen/bad-index/index.html',
    allowConsole: /Failed to load resource/, // Enter opens good.html, which the server does not have
    async check(page, ctx) {
      await h.expect(page, () => /note/.test(document.querySelector('#box .t-search-status').textContent), 'the box to settle');
      await page.fill('#box .t-search-box', 'alpha');
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => ({
        status: document.querySelector('#box .t-search-status').textContent,
        hits: [...document.querySelectorAll('#box .t-search-results a')].map((a) => a.getAttribute('href').replace(/^.*\/bad-index\//, '')),
        anchors: [...document.querySelectorAll('main.luccet a')].map((a) => a.getAttribute('href')).filter((x) => !/good\.html/.test(x)),
      }));
      if (r.hits.join() !== 'good.html#h' || r.status !== '1 result') throw new Error(`"alpha": ${JSON.stringify(r.hits)} (${r.status}), expected good.html#h alone`);
      if (r.anchors.length) throw new Error(`other links on the page: ${JSON.stringify(r.anchors)}`);
      const warned = ctx.console.filter((m) => m.type === 'warning' && /left out/.test(m.text)).length;
      if (warned !== 4) throw new Error(`${warned} warnings, expected one per refused URL`);
      if (ctx.diagnostics.length) throw new Error(`diagnostics ${JSON.stringify(ctx.diagnostics)}`);
      await page.focus('#box .t-search-box');
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/gen\/bad-index\/good\.html#h$/, { timeout: 5000 });
    },
  },
  {
    name: 'a malformed index= is reported in place, not left at Indexing…; an index of another format is refused, with the version that wrote it, and the notes are indexed here',
    url: '/gen/bad-index/index.html',
    async check(page, ctx) {
      await h.expect(page, () => ['#bad', '#old'].every((s) => document.querySelector(`${s} .t-search-status`) && !/Indexing/.test(document.querySelector(`${s} .t-search-status`).textContent)), 'the two boxes to settle');
      const bad = await page.evaluate(() => document.querySelector('#bad .t-search-status').textContent);
      if (!/^The search could not be set up \(.+\)\.$/.test(bad)) throw new Error(`the box's status "${bad}"`);
      if (!ctx.console.some((m) => m.type === 'warning' && /search box could not be set up/.test(m.text))) throw new Error('no warning for the box');
      const old = await page.evaluate(() => document.querySelector('#old .t-search-status').textContent);
      if (/could not be set up|Indexing/.test(old)) throw new Error(`the 0.x index's box says "${old}", expected the notes indexed here`);
      if (!ctx.console.some((m) => m.type === 'warning' && /old\.json was written by luccet 0\.5\.0 in a format this luccet \(\d+\.\d+\.\d+\) does not read: run luccet index again; indexing the notes here/.test(m.text))) throw new Error(`no warning for old.json; console: ${JSON.stringify(ctx.console.slice(0, 8))}`);
      if (ctx.diagnostics.length) throw new Error(`diagnostics ${JSON.stringify(ctx.diagnostics)}`);
    },
  },
];

h.runBrowser(TESTS, {
  generated: {
    'bad-index/index.html': () => ['text/html', badIndexPage()],
    'bad-index/search.json': () => ['application/json', JSON.stringify(badIndex().search)],
    'bad-index/old.json': () => ['application/json', JSON.stringify(badIndex().old)],
  },
  route: (url) => (url.startsWith('/gen/indexed/') ? path.join(indexedDir(), path.normalize(url.slice('/gen/indexed/'.length))) : null),
});
