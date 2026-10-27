#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// glossary.js under node: under luccet check and luccet build a :term[x] is
// a link to the glossary page (page= as written; a page that is not there is
// link.missing), ::glossary stays empty, and luccet index gathers the terms.
// The browser's part is test/browser.js's.
//
//   LUCCET_ROOT=…/luccet node test/glossary/node.js
'use strict';

const fs = require('fs');
const path = require('path');
const h = require('../harness');

h.test('under luccet check and luccet build, :term[x] is a link to the glossary page (page= as written; a page that is not there is link.missing), ::glossary stays empty, and luccet index gathers the terms', () =>
  h.inTemp((dir) => {
    const cli = (args) => h.cli(args, { cwd: dir });
    fs.copyFileSync(path.join(h.ROOT, 'glossary.js'), path.join(dir, 'glossary.js'));
    fs.writeFileSync(path.join(dir, 'a.html'), '<!doctype html><meta charset="utf-8"><title>A</title><script src="luccet.js" data-use="glossary.js"></script>\n# A {#top}\n\nA :dfn[truism] is obvious. Every :term[truism] and :term[kernels]{title=kernel} links.\n\n::glossary\n');
    fs.writeFileSync(path.join(dir, 'b.html'), '<!doctype html><meta charset="utf-8"><title>B</title><script src="luccet.js" data-use="glossary.js?page=/wiki/glossary.html"></script>\nSee :term[truism].\n');
    let r = cli(['check', 'a.html']);
    h.assert(r.code === 0 && /link\.missing/.test(r.out) && /glossary\.html does not exist/.test(r.out), `a missing glossary page is link.missing: ${r.out}${r.err}`);
    fs.writeFileSync(path.join(dir, 'glossary.html'), '<!doctype html><meta charset="utf-8"><script src="luccet.js" data-use="glossary.js"></script>\n::glossary\n');
    r = cli(['check', 'a.html', 'b.html', 'glossary.html']);
    h.assert(r.code === 0 && /3 notes: 0 errors, 0 warnings, 0 infos/.test(r.err), `with the page: ${r.out}${r.err}`);
    r = cli(['build', 'a.html']);
    h.assert(r.code === 0, `luccet build: ${r.err}`);
    const links = [...r.out.matchAll(/<span class="term" data-t="term"([^>]*)><a href="([^"]*)">([^<]*)<\/a><\/span>/g)].map((m) => `${m[3]}→${m[2]}${/ title="([^"]*)"/.test(m[1]) ? ` (${/ title="([^"]*)"/.exec(m[1])[1]})` : ''}`);
    h.assert(links.join(' ') === 'truism→glossary.html kernels→glossary.html (kernel)', `the uses in the built page: ${links.join(' ')}; the entry's # is added when the page shows`);
    h.assert(/<div[^>]*class="glossary[^"]*"[^>]*><\/div>/.test(r.out), `the leaf, empty: ${/<div[^>]*glossary[^>]*>[^]*?<\/div>/.exec(r.out)}`);
    h.assert(/<a href="\/wiki\/glossary\.html">truism<\/a>/.test(cli(['build', 'b.html']).out), 'page= as written');
    r = cli(['index', '.']);
    h.assert(r.code === 0 && /3 notes, [0-9]+ entries, 1 term → /.test(r.err), `luccet index: ${r.err}`);
    const g = JSON.parse(fs.readFileSync(path.join(dir, 'glossary.json'), 'utf8'));
    h.assert(g.terms.length === 1 && g.terms[0].term === 'truism' && g.terms[0].url === 'a.html' && g.terms[0].id === 'top', `glossary.json: ${JSON.stringify(g.terms)}`);
  }),
);

h.runTests();
