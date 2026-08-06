#!/usr/bin/env node
// attrdiff.mjs <baseline-manifest> <current-manifest>
// Diffs the `attribution` section and the `files` key set of two manifests: which files entered or
// left the graph, and which moved between hashing homes (storyReachable / previewSubtree /
// storybookGlobals).
//
// This is the companion to tsdiff.mjs for *structural* probes. tsdiff answers "what recaptures?";
// this answers "where did the graph change shape?". Both read the recorded `attribution` sets, which
// are authoritative — never walk `files` for reachability, it is pruned after hashing.
import { readFileSync } from 'fs';

const SETS = ['storyReachable', 'previewSubtree', 'storybookGlobals'];

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: node attrdiff.mjs <baseline.json> <current.json>');
  process.exit(2);
}

const base = JSON.parse(readFileSync(a, 'utf8'));
const cur = JSON.parse(readFileSync(b, 'utf8'));

function homesOf(manifest) {
  const homes = new Map();
  for (const set of SETS) {
    for (const filePath of manifest.attribution?.[set] ?? []) {
      homes.set(filePath, [...(homes.get(filePath) ?? []), set]);
    }
  }
  return homes;
}

const baseHomes = homesOf(base);
const curHomes = homesOf(cur);
const allFiles = [...new Set([...baseHomes.keys(), ...curHomes.keys()])].sort();

const entered = [];
const left = [];
const rehomed = [];
for (const filePath of allFiles) {
  const before = baseHomes.get(filePath)?.join('+');
  const after = curHomes.get(filePath)?.join('+');
  if (!before) entered.push(`${filePath}  [${after}]`);
  else if (!after) left.push(`${filePath}  (was [${before}])`);
  else if (before !== after) rehomed.push(`${filePath}  [${before}] -> [${after}]`);
}

const counts = (manifest) =>
  SETS.map((set) => `${set}=${(manifest.attribution?.[set] ?? []).length}`).join('  ');

console.log(`files: ${Object.keys(base.files).length} -> ${Object.keys(cur.files).length}`);
console.log(`attribution before: ${counts(base)}`);
console.log(`attribution after:  ${counts(cur)}`);
console.log(`entered graph: ${entered.length}`);
for (const line of entered) console.log(`  + ${line}`);
console.log(`left graph: ${left.length}`);
for (const line of left) console.log(`  - ${line}`);
console.log(`re-homed: ${rehomed.length}`);
for (const line of rehomed) console.log(`  ~ ${line}`);
