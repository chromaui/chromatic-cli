#!/usr/bin/env node
// tsdiff.mjs <baseline-manifest> <current-manifest>
// Diffs two TurboSnap v2 manifests: reports the Storybook hash change and every per-story hash that
// changed. This is the core assertion tool — "which stories would be recaptured?"
import { readFileSync } from 'fs';

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: node tsdiff.mjs <baseline.json> <current.json>');
  process.exit(2);
}

const base = JSON.parse(readFileSync(a, 'utf8'));
const cur = JSON.parse(readFileSync(b, 'utf8'));

const changed = [];
const allStories = new Set([...Object.keys(base.storyFiles), ...Object.keys(cur.storyFiles)]);
for (const s of allStories) {
  const bh = base.storyFiles[s];
  const ch = cur.storyFiles[s];
  if (bh !== ch) changed.push(`${s}  (${bh ?? 'ABSENT'} -> ${ch ?? 'ABSENT'})`);
}

// A storybookFiles entry moving means "recapture everything", so it has to be diffed alongside the
// story hashes — a change can land in either group, and only one of them moves the stories.
const changedStorybookFiles = [];
const allStorybookFiles = new Set([
  ...Object.keys(base.storybookFiles ?? {}),
  ...Object.keys(cur.storybookFiles ?? {}),
]);
for (const key of allStorybookFiles) {
  const bh = (base.storybookFiles ?? {})[key];
  const ch = (cur.storybookFiles ?? {})[key];
  if (bh !== ch) changedStorybookFiles.push(`${key}  (${bh ?? 'ABSENT'} -> ${ch ?? 'ABSENT'})`);
}

console.log(
  `storybookHash: ${base.storybookHash} -> ${cur.storybookHash}  ` +
    (base.storybookHash === cur.storybookHash ? 'SAME' : 'CHANGED')
);
console.log(`stories total: ${allStories.size}`);
console.log(`stories changed: ${changed.length}`);
for (const c of changed) console.log(`  ✎ ${c}`);
console.log(`storybookFiles changed: ${changedStorybookFiles.length}`);
for (const c of changedStorybookFiles) console.log(`  ✎ ${c}`);
