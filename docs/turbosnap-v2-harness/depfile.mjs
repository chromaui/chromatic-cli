#!/usr/bin/env node
// depfile.mjs <manifest.json> <package-name>
// Prints the manifest path of a file belonging to <package-name>, for use as the "edit this file to
// simulate a version bump" target. Exits 1 with a message if the package has no files in the graph.
//
// Why this is derived rather than hardcoded: builders disagree about a package's entry file (vite
// resolves moment to `moment/dist/moment.js`, webpack and rspack to `moment/moment.js`). A fixed path
// would edit a file that is outside one builder's graph, so v2 would see no change while v1 — which
// works from the package *name* — reports the dependent stories. That reads as a v2 regression when
// it is only the harness describing two different changes to the two algorithms.
import { readFileSync } from 'fs';

const [manifestFile, package_] = process.argv.slice(2);
if (!manifestFile || !package_) {
  console.error('usage: node depfile.mjs <manifest.json> <package-name>');
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const prefix = `node_modules/${package_}/`;
const candidates = Object.keys(manifest.files ?? {}).filter((f) => f.includes(prefix));

if (candidates.length === 0) {
  console.error(`no files for "${package_}" in the graph`);
  process.exit(1);
}

// Prefer the shallowest path, which picks the package entry (`moment/moment.js`, `react/index.js`)
// over an incidental deep file (`moment/locale/af.js`, `react/cjs/react.production.js`).
const depth = (f) => f.slice(f.lastIndexOf(prefix) + prefix.length).split('/').length;
candidates.sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
console.log(candidates[0]);
