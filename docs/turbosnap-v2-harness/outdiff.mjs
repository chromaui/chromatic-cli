#!/usr/bin/env node
// outdiff.mjs <base-manifest> <current-manifest>
//
// Diffs two snapshots of a Storybook's *emitted output* — the bytes a browser would fetch — so a
// structural probe can say whether a change the manifest called "nothing" actually produced a
// different build. Every other comparison in this harness works from indexed story IDs or from the
// manifest itself; this one is the only ground truth for "would the render differ".
//
// Each input is `shasum -a 256` output over storybook-static (see `out_manifest` in
// structural-probe.sh, which excludes sourcemaps, the stats file and the manager bundle).
//
// Bundlers put a content hash in the filename, so a changed chunk shows up as one file vanishing and
// another appearing. Names are normalized past that hash before comparing, which turns those pairs
// back into a single "changed" line and leaves genuine additions and removals visible.
import fs from 'fs';

const [baseFile, curFile] = process.argv.slice(2);
if (!baseFile || !curFile) {
  console.error('usage: outdiff.mjs <base-manifest> <current-manifest>');
  process.exit(2);
}

function normalize(name) {
  return (
    name
      // vite: assets/PathDerived.stories-DONSmxVE.js, assets/logo-DOxA0yNj.svg
      .replace(/-[A-Za-z0-9_-]{8}(?=\.[A-Za-z0-9]+$)/, '-*')
      // webpack: PathDerived-PathDerived-stories.c0ecdba0.iframe.bundle.js, logo.34edcf0e.svg
      .replace(/\.[0-9a-f]{8}\./g, '.*.')
  );
}

function read(file) {
  const entries = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([0-9a-f]{64})\s+(.+)$/);
    if (!match) continue;
    const [, sha, name] = match;
    entries.set(normalize(name), { sha: sha.slice(0, 12), name });
  }
  return entries;
}

const base = read(baseFile);
const cur = read(curFile);

const changed = [];
const added = [];
const removed = [];
let identical = 0;

for (const [key, entry] of base) {
  const other = cur.get(key);
  if (!other) removed.push(`- ${entry.name}`);
  else if (other.sha !== entry.sha) changed.push(`~ ${key}  ${entry.sha} -> ${other.sha}`);
  else if (other.name !== entry.name)
    changed.push(`~ ${entry.name} -> ${other.name}  (renamed, same bytes)`);
  else identical++;
}
for (const [key, entry] of cur) {
  if (!base.has(key)) added.push(`+ ${entry.name}`);
}

const lines = [...changed.sort(), ...added.sort(), ...removed.sort()];
console.log(
  `${identical} identical, ${changed.length} changed, ${added.length} added, ${removed.length} removed`
);
for (const line of lines) console.log(`  ${line}`);
if (lines.length === 0) console.log('  emitted output is byte-identical');
