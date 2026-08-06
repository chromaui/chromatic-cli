#!/usr/bin/env node
// bucket.mjs <manifest> [path-substring]
// Prints the manifest's `attribution` section: which of the three hashing homes each real file
// landed in — a story's subtree (storyReachable), a `.storybook/preview.*` subtree (previewSubtree),
// or the `<storybookGlobals>` catch-all.
//
// These sets are recorded by the same pass that computes the hashes, so they are authoritative.
// Do NOT reconstruct them by walking `files` from the stories: synthetic nodes (require-context
// globs, externals, virtual modules) are pruned from the written graph *after* hashing, so the walk
// hits holes and reports correctly-attributed files as orphans.
//
// With a path substring, reports which set(s) each matching file is in instead of listing the bucket.
import { readFileSync } from 'fs';

const [file, substring] = process.argv.slice(2);
if (!file) {
  console.error('usage: node bucket.mjs <manifest.json> [path-substring]');
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(file, 'utf8'));
const attribution = manifest.attribution;
if (!attribution) {
  console.error(
    'manifest has no `attribution` section — it was built by a CLI predating it. Run `yarn build`.'
  );
  process.exit(1);
}

const SETS = ['storyReachable', 'previewSubtree', 'storybookGlobals'];
const total = Object.keys(manifest.files).length;
const counted = SETS.reduce((sum, set) => sum + attribution[set].length, 0);

if (substring) {
  const matches = new Set(
    SETS.flatMap((set) => attribution[set]).filter((p) => p.includes(substring))
  );
  if (matches.size === 0) {
    console.log(`no attributed file matches "${substring}"`);
    process.exit(0);
  }
  for (const filePath of [...matches].sort()) {
    const sets = SETS.filter((set) => attribution[set].includes(filePath));
    console.log(`${sets.join(', ')}\t${filePath}`);
  }
  process.exit(0);
}

console.log(`files in manifest: ${total}   attributed: ${counted}`);
for (const set of SETS) console.log(`${set}: ${attribution[set].length}`);
console.log(`\n<storybookGlobals> members (${attribution.storybookGlobals.length}):`);
for (const filePath of attribution.storybookGlobals) console.log(`   ${filePath}`);
