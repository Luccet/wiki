#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// notes.js under node: it runs under the command line with no diagnostic,
// and ::notes is an empty list until the browser fills it from notes.json.
// The browser's part is test/browser.js's.
//
//   LUCCET_ROOT=…/luccet node test/notes/node.js
'use strict';

const h = require('../harness');

h.test('under luccet check and luccet build: no diagnostic, and ::notes is an empty leaf, which the browser fills', async () => {
  const page = await h.checkAndBuild('notes.js', '# Hello\n\n::notes{limit=3}\n');
  const list = /<nav [^>]*data-t="notes"[^>]*>(.*?)<\/nav>/.exec(page);
  h.assert(list && list[1] === '', `the leaf: ${list && list[0]}`);
});

h.runTests();
