#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// notes.js in Chromium and Firefox (test/harness.js): the catalogue the
// engine's `luccet index` writes, listed newest first with dates and
// descriptions, sort= and limit=, a catalogue that cannot be loaded; a page
// reached as its folder or without its extension left out; the page's own
// words; and a catalogue's entries that are no page of the site, a
// malformed from= and a catalogue of another format.
//
//   LUCCET_ROOT=…/luccet node test/notes/browser.js [--browsers=…] [--filter=TEXT]
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const h = require('../harness');

// test/notes/pages/search/ copied to a temporary folder and indexed there with
// `luccet index`, so notes.json sits beside the notes without being written
// into the repository; served as /gen/indexed/. Once.
let indexed = null;
function indexedDir() {
  if (indexed) return indexed;
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'luccet-notes-indexed-')), 'search');
  fs.cpSync(path.join(h.ROOT, 'test', 'notes', 'pages', 'search'), dir, { recursive: true });
  const r = h.cli(['index', dir, '--all']);
  if (r.code !== 0) throw new Error(`luccet index exited ${r.code}: ${r.err.trim()}`);
  return (indexed = dir);
}

// A catalogue as luccet index never writes one: entries whose URLs are no
// page of the site, beside one that is; one written by 1.x, with no format;
// and a from= that is no URL. Served as /gen/bad-index/.
function badIndexPage() {
  return [
    '<!doctype html><meta charset="utf-8"><title>A crafted catalogue</title><script src="/luccet.js" data-use="/notes.js"></script>',
    '',
    ':::meta',
    'robots: noindex',
    ':::',
    '',
    '# URLs a catalogue may not hold',
    '',
    '::notes{#list}',
    '',
    'One written by luccet 1.x, in no format:',
    '',
    '::notes{#old from=old.json}',
    '',
    'One whose from= is no URL:',
    '',
    '::notes{#badfrom from="http://[bad"}',
    '',
  ].join('\n');
}
const urls = ['good.html', 'javascript:alert(1)//', 'data:text/html,<script>alert(1)</script>', 'https://other.example/x.html', '//other.example/y.html'];
const catalogue = (format) => ({ luccet: format ? h.luccet.version : '1.1.1', ...(format ? { format } : {}), notes: urls.map((url, i) => ({ url, title: `Alpha ${i}`, date: `2026-01-0${i + 1}`, meta: {}, headings: [], links: [] })) });

const TESTS = [
  {
    name: 'lists the catalogue luccet index wrote, newest first, with dates and descriptions, a date that is not one last and without <time>; sort=title and limit; limit=0; a catalogue that cannot be loaded says so',
    url: '/gen/indexed/notes.html',
    allowConsole: /Failed to load resource/,
    async check(page, ctx) {
      await h.expect(page, () => document.querySelectorAll('.t-notes').length === 4 && [...document.querySelectorAll('.t-notes')].every((n) => n.querySelector('.t-notes-list, .t-notes-status')), 'the four lists to settle');
      const r = await page.evaluate(() => [...document.querySelectorAll('.t-notes')].map((n) => ({
        label: n.getAttribute('aria-label'),
        tag: n.tagName,
        role: n.querySelector('.t-notes-list') && n.querySelector('.t-notes-list').getAttribute('role'),
        items: [...n.querySelectorAll('li')].map((li) => [li.querySelector('.t-notes-title').textContent, li.querySelector('.t-notes-title').getAttribute('href').replace(/^.*\/indexed\//, ''), (li.querySelector('.t-notes-date') || {}).textContent || '', (li.querySelector('.t-notes-desc') || {}).textContent || '', li.querySelector('time') ? li.querySelector('time').getAttribute('datetime') : null]),
        status: (n.querySelector('.t-notes-status') || {}).textContent || '',
      })));
      const want = [
        ['Beta: circles', 'beta.html', '2026-03-01', 'Circles and what is inscribed in them.', '2026-03-01'],
        ['Alpha: triangles', 'alpha.html', '2026-02-01', 'Right triangles and their hypotenuse.', '2026-02-01'],
        ['Hidden', 'hidden.html', '2025-12-31', '', '2025-12-31'],
        ['Odd: a date that is not one', 'odd.html', 'March 2026', 'A catalogue entry whose date is prose.', null],
      ];
      if (JSON.stringify(r[0].items) !== JSON.stringify(want)) throw new Error(`the default list ${JSON.stringify(r[0].items)}, expected newest first, the odd date last as written and without <time>, the noindex pages and this page left out`);
      if (r[0].role !== 'list') throw new Error(`the list's role is ${r[0].role}`);
      if (r[1].items.length || r[1].status !== 'No notes.') throw new Error(`limit=0: ${JSON.stringify(r[1])}, expected none listed`);
      if (JSON.stringify(r[2].items.map((i) => i[0])) !== JSON.stringify(['Alpha: triangles', 'Beta: circles'])) throw new Error(`sort=title limit=2: ${JSON.stringify(r[2].items)}`);
      if (r[3].items.length || !/could not be loaded \(missing\.json\)/.test(r[3].status)) throw new Error(`the missing catalogue: ${JSON.stringify(r[3])}`);
      if (r.some((n) => n.label !== 'Notes' || n.tag !== 'NAV')) throw new Error(`the element: ${JSON.stringify(r.map((n) => [n.tag, n.label]))}`);
      if (!ctx.console.some((m) => m.type === 'warning' && /missing\.json could not be loaded/.test(m.text))) throw new Error('no warning for missing.json');
      if (ctx.diagnostics.length) throw new Error(`diagnostics ${JSON.stringify(ctx.diagnostics)}`);
    },
  },
  ...[
    ['a page reached as its folder (folder/) is the index.html the catalogue names, and is left out', '/test/notes/pages/folder/', /\/folder\/$/, 'plain.html,post.html'],
    ['a page reached without its extension (folder/plain) is the plain.html the catalogue names, and is left out', '/test/notes/pages/folder/plain', /\/folder\/plain$/, 'post.html,index.html'],
  ].map(([name, url, at, want]) => ({
    name,
    url,
    async check(page, ctx) {
      await h.expect(page, () => document.querySelector('.t-notes-list, .t-notes-status'), 'the list to settle');
      const r = await page.evaluate(() => ({
        href: location.href,
        items: [...document.querySelectorAll('.t-notes-list a')].map((a) => a.getAttribute('href').replace(/^.*\/folder\//, '')),
        status: (document.querySelector('.t-notes-status') || {}).textContent || '',
      }));
      if (!at.test(r.href)) throw new Error(`the page is at ${r.href}`);
      if (r.items.join() !== want) throw new Error(`the list ${JSON.stringify(r.items)} ${r.status}, expected the other two pages: the page itself left out`);
      if (ctx.diagnostics.length) throw new Error(`diagnostics ${JSON.stringify(ctx.diagnostics)}`);
    },
  })),
  {
    name: "window.LUCCET.strings: the notes list speaks the page's words",
    url: '/test/notes/pages/strings.html',
    allowConsole: /Failed to load resource/,
    async check(page) {
      await h.expect(page, () => document.querySelector('.t-notes-status'), 'the list to settle');
      const r = await page.evaluate(() => ({ label: document.querySelector('.t-notes').getAttribute('aria-label'), missing: document.querySelector('.t-notes-status').textContent }));
      if (r.label !== 'Notizen' || r.missing !== 'Die Liste (missing.json) fehlt.') throw new Error(`the notes list: ${JSON.stringify(r)}`);
    },
  },
  {
    name: "a catalogue entry whose URL is javascript:, data:, another site or a protocol-relative one is left out with a warning; the site's own page stays",
    url: '/gen/bad-index/index.html',
    allowConsole: /Failed to load resource/,
    async check(page, ctx) {
      await h.expect(page, () => document.querySelector('#list .t-notes-list, #list .t-notes-status'), 'the list to settle');
      const r = await page.evaluate(() => ({
        list: [...document.querySelectorAll('#list .t-notes-list a')].map((a) => a.getAttribute('href').replace(/^.*\/bad-index\//, '')),
        anchors: [...document.querySelectorAll('main.luccet a')].map((a) => a.getAttribute('href')).filter((x) => !/good\.html/.test(x)),
      }));
      if (r.list.join() !== 'good.html') throw new Error(`the list ${JSON.stringify(r.list)}, expected good.html alone`);
      if (r.anchors.length) throw new Error(`other links on the page: ${JSON.stringify(r.anchors)}`);
      const warned = ctx.console.filter((m) => m.type === 'warning' && /left out/.test(m.text)).length;
      if (warned !== 4) throw new Error(`${warned} warnings, expected one per refused URL`);
      if (ctx.diagnostics.length) throw new Error(`diagnostics ${JSON.stringify(ctx.diagnostics)}`);
    },
  },
  {
    name: 'a malformed from= is reported in place; a catalogue of another format (1.x wrote none) is refused, with the version that wrote it',
    url: '/gen/bad-index/index.html',
    async check(page, ctx) {
      await h.expect(page, () => document.querySelector('#badfrom .t-notes-status') && document.querySelector('#old .t-notes-status'), 'the two lists to settle');
      const r = await page.evaluate(() => ({ bad: document.querySelector('#badfrom .t-notes-status').textContent, old: document.querySelector('#old .t-notes-status').textContent, oldItems: document.querySelectorAll('#old li').length }));
      if (!/^The list of notes could not be loaded \(http:\/\/\[bad\)\.$/.test(r.bad)) throw new Error(`the list's status "${r.bad}"`);
      if (!ctx.console.some((m) => m.type === 'warning' && /from=http:\/\/\[bad is not an http\(s\) file/.test(m.text))) throw new Error('no warning for the list');
      if (r.old !== 'The list of notes was written by luccet 1.1.1; run luccet index again.' || r.oldItems) throw new Error(`the 1.x catalogue: ${JSON.stringify(r)}`);
      if (!ctx.console.some((m) => m.type === 'warning' && /old\.json was written by luccet 1\.1\.1 in a format this add-on \(1\) does not read: run luccet index again/.test(m.text))) throw new Error(`no warning for old.json; console: ${JSON.stringify(ctx.console.slice(0, 8))}`);
      if (ctx.diagnostics.length) throw new Error(`diagnostics ${JSON.stringify(ctx.diagnostics)}`);
    },
  },
];

h.runBrowser(TESTS, {
  generated: {
    'bad-index/index.html': () => ['text/html', badIndexPage()],
    'bad-index/notes.json': () => ['application/json', JSON.stringify(catalogue(1))],
    'bad-index/old.json': () => ['application/json', JSON.stringify(catalogue(0))],
  },
  route: (url) => (url.startsWith('/gen/indexed/') ? path.join(indexedDir(), path.normalize(url.slice('/gen/indexed/'.length))) : null),
});
