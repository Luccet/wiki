#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// search.js under node: it runs under the command line with no diagnostic,
// and ::search is an empty box until the browser fills it. The browser's
// part is test/browser.js's.
//
//   LUCCET_ROOT=…/luccet node test/search/node.js
'use strict';

const h = require('../harness');

h.test("under luccet check and luccet build: no diagnostic, and ::search is an empty leaf, which the browser fills", async () => {
  const page = await h.checkAndBuild('search.js', '# Hello\n\n::search{placeholder="Find"}\n\nSee [a note](n.html).\n');
  const box = /<[a-z]+ [^>]*data-t="search"[^>]*>(.*?)<\/[a-z]+>/.exec(page);
  h.assert(box && box[1] === '', `the leaf: ${box && box[0]}`);
});

h.runTests();
