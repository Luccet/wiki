#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// This repository's releases as a site for GitHub Pages, at
// luccet.github.io/<name>/, which cdn.luccet.dev serves as
// cdn.luccet.dev/<name>/ (a bunny.net pull zone: its edge rules send a path
// with a folder before the version to luccet.github.io):
//
//   vX.Y.Z/   a release: the files package.json's "files" names, as its tag has them
//   vX.Y/     the newest release of the series
//   vX/       the newest release of the major
//
// The CDN keeps a release's folder a year and the others an hour. A tag's
// files are its bytes, so a release served never changes. A tag whose
// package.json has no "files" takes this checkout's list, less what the tag
// does not have. The same file in every add-on repository and in
// Luccet/themes, copied from the holding folder's _shared/.
//
//   node tools/site.js [--out DIR]   build the site into DIR (default _site), emptied first
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function fail(message) {
  console.log(`✗ ${message}`);
  process.exit(1);
}

function git(args, encoding = 'utf8') {
  const r = spawnSync('git', args, { cwd: ROOT, encoding, maxBuffer: 256 << 20 });
  return r.status === 0 ? r.stdout : null;
}

// A "files" entry as a test of a path: `*` within one segment, a trailing `/` for a folder.
function pattern(entry) {
  const source = entry.replace(/\/+$/, '').split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
  return new RegExp(`^${source}${entry.endsWith('/') ? '/' : '$'}`);
}

function filesOf(json, where) {
  let pkg;
  try {
    pkg = JSON.parse(json);
  } catch {
    fail(`${where}: package.json is not JSON`);
  }
  if (pkg.files === undefined) return null;
  if (!Array.isArray(pkg.files) || !pkg.files.length || !pkg.files.every((f) => typeof f === 'string' && f)) fail(`${where}: package.json's "files" is not a list of paths`);
  return pkg.files;
}

// The releases, oldest first: every vX.Y.Z tag.
function releases() {
  return (git(['tag', '--list', 'v*']) || '')
    .split('\n')
    .map((t) => /^v(\d+)\.(\d+)\.(\d+)$/.exec(t.trim()))
    .filter(Boolean)
    .map((m) => ({ tag: m[0], parts: m.slice(1).map(Number) }))
    .sort((a, b) => a.parts[0] - b.parts[0] || a.parts[1] - b.parts[1] || a.parts[2] - b.parts[2]);
}

function build(out) {
  const inside = path.relative(out, ROOT);
  if (!inside.startsWith('..') && !path.isAbsolute(inside)) fail(`${out} holds the repository; name a folder of its own`);
  const own = filesOf(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'), 'this checkout');
  if (!own) fail('package.json has no "files": list what a release serves');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const list = releases();
  for (const r of list) {
    const json = git(['cat-file', 'blob', `${r.tag}:package.json`]);
    const listed = json === null ? null : filesOf(json, r.tag);
    const tree = (git(['ls-tree', '-r', '-z', '--name-only', r.tag]) || '').split('\0').filter(Boolean);
    const served = [];
    for (const entry of listed || own) {
      const found = tree.filter((f) => pattern(entry).test(f));
      if (!found.length && listed) fail(`${r.tag}: "files" names ${entry}, which its tree does not have`);
      served.push(...found);
    }
    if (!served.length) fail(`${r.tag}: none of ${(listed || own).join(', ')} is in its tree`);
    for (const f of new Set(served)) {
      const file = path.join(out, r.tag, f);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, git(['cat-file', 'blob', `${r.tag}:${f}`], 'buffer'));
    }
    r.count = new Set(served).size;
  }
  // Copies, since Pages has no redirects; oldest first, so the newest is the last set.
  const newest = new Map();
  for (const r of list) newest.set(`v${r.parts[0]}.${r.parts[1]}`, r).set(`v${r.parts[0]}`, r);
  for (const [name, r] of newest) fs.cpSync(path.join(out, r.tag), path.join(out, name), { recursive: true });

  console.log(`✓ ${path.relative(process.cwd(), out) || out}: ${list.length ? list.map((r) => `${r.tag} (${r.count} file${r.count === 1 ? '' : 's'})`).join(', ') : 'no release yet'}`);
  for (const [name, r] of newest) console.log(`  ${name}/ is ${r.tag}`);
}

const args = process.argv.slice(2);
const at = args.indexOf('--out');
if (args.length !== (at === -1 ? 0 : 2) || (at !== -1 && !args[at + 1])) fail('usage: node tools/site.js [--out DIR]');
build(path.resolve(at === -1 ? path.join(ROOT, '_site') : args[at + 1]));
