#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// glossary.js in Chromium and Firefox (test/harness.js): ::glossary lists
// the terms the engine's `luccet index` gathered, each linked to its
// definition, the definition rendered as foreign content (luccet.render
// with safe: data-t-safe, no behaviour) with its links led back to its note
// and its formulas MathML; in= keeps a folder; a missing file and a file of
// another format say so; :term links to the entry.
//
//   LUCCET_ROOT=…/luccet node test/glossary/browser.js [--browsers=…] [--filter=TEXT]
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const h = require('../harness');

// test/glossary/pages/glossary/ copied to a temporary folder and indexed there with
// `luccet index`, so glossary.json sits beside the notes; served as
// /gen/glossary/. Once.
let indexed = null;
function indexedDir() {
  if (indexed) return indexed;
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'luccet-glossary-indexed-')), 'glossary');
  fs.cpSync(path.join(h.ROOT, 'test', 'glossary', 'pages', 'glossary'), dir, { recursive: true });
  const r = h.cli(['index', dir, '--all']);
  if (r.code !== 0) throw new Error(`luccet index exited ${r.code}: ${r.err.trim()}`);
  return (indexed = dir);
}

const TESTS = [
  {
    name: '::glossary lists the terms luccet index gathered, by key, each linked to its definition, rendered as foreign content with its links led back to its note and its math MathML; in= keeps a folder; a missing file and a file of another format say so; :term links to the entry',
    url: '/gen/glossary/glossary.html',
    allowConsole: /Failed to load resource/,
    async check(page, ctx) {
      await h.expect(page, () => document.querySelectorAll('.t-glossary').length === 4 && [...document.querySelectorAll('.t-glossary')].every((n) => n.querySelector('.t-glossary-list, .t-glossary-status')) && document.querySelectorAll('#list .t-math > math').length >= 3, 'the four lists to settle, the math MathML');
      const r = await page.evaluate(() => {
        const rel = (x) => (x || '').replace(/^.*\/gen\/glossary\//, '');
        const list = (id) => ({
          entries: [...document.querySelectorAll(`#${id} dt`)].map((dt) => [dt.id, dt.textContent, rel(dt.querySelector('a').getAttribute('href')), dt.nextElementSibling.querySelector('.t-glossary-source a').textContent, dt.nextElementSibling.querySelector('p').textContent.replace(/\s+/g, ' ').trim()]),
          links: [...document.querySelectorAll(`#${id} dd a`)].map((a) => rel(a.getAttribute('href'))),
          status: (document.querySelector(`#${id} .t-glossary-status`) || {}).textContent || '',
          mathml: document.querySelectorAll(`#${id} .t-math[data-tex] > math`).length,
          math: [...document.querySelectorAll(`#${id} .t-math`)].filter((m) => !m.querySelector(':scope > math')).length,
          definitions: [...document.querySelectorAll(`#${id} dd > .t-glossary-definition`)].map((d) => d.hasAttribute('data-t-safe')),
        });
        return { list: list('list'), sub: list('sub'), missing: list('missing'), old: list('old'), uses: [...document.querySelectorAll('.term > a')].map((a) => [a.textContent, rel(a.getAttribute('href'))]), label: document.querySelector('#list').getAttribute('aria-label'), tag: document.querySelector('#list .t-glossary-list').tagName };
      });
      const want = [
        ['glossary-kernel', 'Kernel', 'defs.html#ker', 'From Smoke: definitions'],
        ['glossary-nullity', 'nullity', 'defs.html#defs', 'From Smoke: definitions'],
        ['glossary-truism', 'truism', 'defs.html#defs', 'From Smoke: definitions'],
        ['glossary-widget', 'widget', 'sub/more.html#more', 'From Smoke: more'],
      ];
      const got = r.list.entries.map((e) => [e[0], e[1], e[2], e[3], e[4].replace(/​|\s*(?=[.,;])/g, '')]);
      for (let i = 0; i < want.length; i++) if (!got[i] || got[i].slice(0, 4).join('|') !== want[i].join('|')) throw new Error(`entry ${i}: ${JSON.stringify(got[i])}, expected ${JSON.stringify(want[i])} (all: ${JSON.stringify(r.list.entries)})`);
      if (got.length !== 4) throw new Error(`${got.length} entries: ${JSON.stringify(got)}`);
      if (!/^A truism is a claim so obviously true/.test(got[2][4]) || !/see the glossary and/.test(got[2][4])) throw new Error(`the truism's definition: ${JSON.stringify(got[2][4])}`);
      for (const l of ['defs.html#ker', 'glossary.html', 'sub/more.txt']) if (!r.list.links.includes(l)) throw new Error(`the definitions' links ${JSON.stringify(r.list.links)} lack ${l}: a fragment, a relative link and a link from a subfolder, led back to their notes`);
      if (r.list.mathml < 3 || r.list.math) throw new Error(`${r.list.mathml} formulas MathML, ${r.list.math} not: the definitions' formulas are the engine's MathML`);
      if (r.list.definitions.length !== 4 || !r.list.definitions.every(Boolean)) throw new Error(`the definitions' safe roots: ${JSON.stringify(r.list.definitions)}, expected each a data-t-safe root`);
      if (r.sub.entries.map((e) => e[1]).join() !== 'widget') throw new Error(`in=sub/: ${JSON.stringify(r.sub.entries)}`);
      if (!/could not be loaded \(missing\.json\)/.test(r.missing.status)) throw new Error(`the missing file: ${JSON.stringify(r.missing)}`);
      if (r.old.status !== 'The glossary was written by luccet 0.5.0; run luccet index again.') throw new Error(`the 0.x file: ${JSON.stringify(r.old)}`);
      if (!ctx.console.some((m) => m.type === 'warning' && /old\.json was written by luccet 0\.5\.0 in a format this luccet \(\d+\.\d+\.\d+\) does not read: run luccet index again/.test(m.text))) throw new Error(`no warning for old.json; console: ${JSON.stringify(ctx.console.slice(0, 8))}`);
      if (JSON.stringify(r.uses) !== JSON.stringify([['truism', 'glossary.html#glossary-truism'], ['kernels', 'glossary.html#glossary-kernel'], ['nothing', 'glossary.html#glossary-nothing']])) throw new Error(`the uses ${JSON.stringify(r.uses)}: expected links to this page's entries, title= as the term`);
      if (r.label !== 'Glossary' || r.tag !== 'DL') throw new Error(`the element: ${r.tag} labelled ${r.label}`);
      if (!ctx.console.some((m) => m.type === 'warning' && /missing\.json could not be loaded/.test(m.text))) throw new Error('no warning for missing.json');
      if (ctx.diagnostics.length) throw new Error(`diagnostics ${JSON.stringify(ctx.diagnostics)}`);
    },
  },
];

h.runBrowser(TESTS, { route: (url) => (url.startsWith('/gen/glossary/') ? path.join(indexedDir(), path.normalize(url.slice('/gen/glossary/'.length))) : null) });
