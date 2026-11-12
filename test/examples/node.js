#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// The examples under node: every page passes luccet check with nothing to
// report, and the index files beside them are the ones luccet index writes,
// whatever version of it.
// The browser's part is test/examples/browser.js's.
//
//   LUCCET_ROOT=…/luccet node test/examples/node.js
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const h = require('../harness');

const DIR = path.join(h.ROOT, 'examples');
const pages = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.html'));

// Whether the engine bounds a definition by an inline :definition[…], which
// came after luccet 2.0.0. An engine before it writes the dfn's whole
// paragraph into glossary.json, so the file differs from the one here,
// which the engine's main writes.
function boundsDefinitions() {
  const { ast } = h.luccet.parse(':definition[A :dfn[x] is a y.] More.\n');
  h.luccet.transform(ast);
  const [term] = h.luccet.glossary.terms(ast);
  return !!term && !JSON.stringify(term.definition).includes('More');
}

h.test('examples/: every example passes luccet check with nothing to report', () => {
  const files = pages();
  h.assert(files.length > 0, 'examples/ holds no note');
  const r = h.cli(['check', 'examples'], { cwd: h.ROOT });
  const want = `luccet check: ${files.length} note${files.length === 1 ? '' : 's'}: 0 errors, 0 warnings, 0 infos`;
  h.assert(r.code === 0 && (r.out + r.err).trim() === want, `expected "${want}": ${r.out}${r.err}`);
});

// What luccet index writes for the examples, in a copy of them and the
// add-ons, a git repository of its own with the files staged (only tracked
// notes are indexed, and a note's add-ons are read inside its repository),
// is the files here but for the version that wrote them: a new engine
// version alone does not make them stale.
h.test('examples/: notes.json, search.json and glossary.json are what luccet index writes, the version that wrote them aside; every page indexed, nothing else said', () =>
  h.inTemp((dir) => {
    fs.mkdirSync(path.join(dir, 'examples'));
    for (const f of pages()) fs.copyFileSync(path.join(DIR, f), path.join(dir, 'examples', f));
    for (const f of ['notes.js', 'search.js', 'glossary.js']) fs.copyFileSync(path.join(h.ROOT, f), path.join(dir, f));
    for (const args of [['init', '-q'], ['add', '-A']]) h.assert(spawnSync('git', args, { cwd: dir }).status === 0, `git ${args.join(' ')}`);
    const r = h.cli(['index', 'examples'], { cwd: dir });
    const said = new RegExp(`^luccet index: ${pages().length} notes, \\d+ entries, \\d+ terms → examples/notes\\.json, examples/search\\.json, examples/glossary\\.json$`);
    h.assert(r.code === 0 && said.test((r.out + r.err).trim()), `every page indexed, and no term defined twice or used undefined: ${r.out}${r.err}`);
    const read = (d, f) => {
      const { luccet, ...rest } = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
      return JSON.stringify(rest);
    };
    for (const f of ['notes.json', 'search.json', 'glossary.json']) {
      if (read(DIR, f) === read(path.join(dir, 'examples'), f)) continue;
      if (f === 'glossary.json' && !boundsDefinitions()) throw new h.Skip(`luccet ${h.luccet.version} predates the inline :definition[…], so its glossary.json is not the one here, which the engine's main writes`);
      h.assert(false, `examples/${f} is not what luccet ${h.luccet.version} writes: run luccet index examples and commit the files`);
    }
  }));

h.runTests();
