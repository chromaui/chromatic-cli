#!/usr/bin/env node
// parity.mjs <base-manifest> <cur-manifest> <v1-result.json> <base-dir>
// Compares the stories TurboSnap v1 would recapture against the stories v2 would recapture, for the
// same edit on the same fixture, and prints a verdict. This is the check for *Agreed design 2* of the
// Story Attribution Accuracy map: v2 must never scope worse than v1.
//
//   v1 input:  the JSON from `chromatic trace --json` (optionally with `-d <pkg>` for a dep bump).
//   v2 input:  two `chromatic turbosnap-manifest` outputs, before and after the edit.
//   base dir:  the Storybook project's repo-relative path (e.g. `packages/ui`), needed because the
//              two algorithms spell a story file differently — see toManifestKey.
//
// Exit code is 1 when the verdict is a regression, so this can gate a run.
import { readFileSync } from 'fs';
import path from 'path';

const [baseFile, curFile, v1File, baseDir] = process.argv.slice(2);
if (!baseFile || !curFile || !v1File || !baseDir) {
  console.error('usage: node parity.mjs <base.json> <cur.json> <v1-result.json> <base-dir>');
  process.exit(2);
}

const base = JSON.parse(readFileSync(baseFile, 'utf8'));
const cur = JSON.parse(readFileSync(curFile, 'utf8'));
const v1 = JSON.parse(readFileSync(v1File, 'utf8'));

// A story file as it appears in either algorithm's output. Used only to recognise story files that
// v2 never indexed — v2's own manifest keys are authoritative for everything it does know about.
const STORY_FILE = /\.stories\.(?:mdx|m?[jt]sx?)$/;

/**
 * Re-spells a v1 path as a v2 manifest key. `chromatic trace --json` reports repo-relative paths
 * (v1's `normalizePath` prepends the base dir), while v2 keys files project-relative with a `./`
 * prefix. Comparing the two spellings directly makes every story look unknown to v2, which reads as a
 * total detection loss rather than the parity it actually is.
 */
function toManifestKey(repoRelativePath) {
  const projectRelative = path.posix.relative(baseDir, repoRelativePath);
  return projectRelative.startsWith('../') ? projectRelative : `./${projectRelative}`;
}

// Stories v2 knows about: the keys of its manifest.
const v2Stories = [...new Set([...Object.keys(base.storyFiles), ...Object.keys(cur.storyFiles)])];
const v2StorySet = new Set(v2Stories);

// v1 reports *module bundles*, which on webpack concatenate a story file with its imports, so its raw
// output holds non-story members too. Keep the ones v2 indexed, plus any that look like a story file
// v2 missed entirely — dropping those would report a total detection loss as a clean "parity".
const v1Reported = (v1.status === 'bailed' ? [] : (v1.storyFiles ?? [])).map(toManifestKey);
const v1Stories = v1Reported.filter((f) => v2StorySet.has(f) || STORY_FILE.test(f));

// Story files v1 found that v2 never put in its manifest. v2 cannot recapture what it never indexed,
// so these are misses regardless of hashes.
const unknownToV2 = v1Stories.filter((f) => !v2StorySet.has(f));

// The universe both sides are scored against.
const allStories = [...new Set([...v2Stories, ...unknownToV2])].sort();

/**
 * v1's recapture set. A bail means "recapture everything", so it widens to every story — and it is
 * the only case where v1's width carries no per-story evidence. Tracing to every story is evidence,
 * not bluntness: each of those stories really does reach the changed file.
 */
function v1Recaptures() {
  if (v1.status === 'bailed') {
    return { stories: allStories, blunt: true, why: `bailed: ${describeBail(v1.bailReason)}` };
  }
  return { stories: v1Stories, blunt: false, why: 'traced' };
}

/**
 * v2's recapture set. Per manifest.ts, `storybookFiles` is the backend's "did Storybook itself
 * change" gate: if any entry moves, the whole Storybook is considered changed and every story
 * recaptures. Only when the bucket holds still do the per-story hashes decide.
 */
function v2Recaptures() {
  const bucket = diffBucket();
  // Recapture-everything still only reaches the stories v2 indexed.
  if (bucket.length > 0) {
    return { stories: v2Stories, blunt: true, why: `storybookFiles moved: ${bucket.join(', ')}` };
  }
  const stories = v2Stories.filter((s) => base.storyFiles[s] !== cur.storyFiles[s]);
  return { stories, blunt: false, why: 'per-story hashes' };
}

/** The `storybookFiles` keys whose value differs between the two manifests. */
function diffBucket() {
  const keys = new Set([
    ...Object.keys(base.storybookFiles ?? {}),
    ...Object.keys(cur.storybookFiles ?? {}),
  ]);
  return [...keys].filter((k) => (base.storybookFiles ?? {})[k] !== (cur.storybookFiles ?? {})[k]);
}

function describeBail(reason) {
  if (!reason) return 'unknown';
  return Object.entries(reason)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.length : value}`)
    .join(' ');
}

const a = v1Recaptures();
const b = v2Recaptures();
const aSet = new Set(a.stories);
const bSet = new Set(b.stories);

const missing = a.stories.filter((s) => !bSet.has(s)); // v1 caught it, v2 did not
const extra = b.stories.filter((s) => !aSet.has(s)); // v2 caught it, v1 did not

// `v2 narrower` vs `v2 MISSES`: narrowing matters only against *evidence*. When v1's width came from
// a bail (or from sweeping every story), it never attributed those stories to the edit — scoping
// tighter is the improvement this map is after (Agreed design 1). When v1 *traced* to a specific set
// and v2 lost a member of it, that is the regression Agreed design 2 forbids.
let verdict;
let failed = false;
if (missing.length === 0 && extra.length === 0) {
  verdict = 'parity';
} else if (missing.length === 0) {
  verdict = b.blunt ? 'v2 wider (over-captures — safe)' : 'v1 MISSES a story v2 caught';
} else if (a.blunt) {
  verdict = 'v2 narrower (v1 was blunt: no per-story evidence lost)';
} else {
  verdict = 'v2 MISSES a story v1 caught';
  failed = true;
}

const fmt = (list) => (list.length === 0 ? '(none)' : list.join(', '));
console.log(`v1 recaptures (${a.stories.length}/${allStories.length}) [${a.why}]`);
console.log(`   ${fmt(a.stories)}`);
console.log(`v2 recaptures (${b.stories.length}/${allStories.length}) [${b.why}]`);
console.log(`   ${fmt(b.stories)}`);
if (missing.length > 0) console.log(`missing in v2: ${fmt(missing)}`);
if (extra.length > 0) console.log(`extra in v2:   ${fmt(extra)}`);
if (unknownToV2.length > 0) {
  console.log(`NOT INDEXED BY v2: ${fmt(unknownToV2)} — absent from the manifest entirely.`);
}

// A dependency bump that neither algorithm traces anywhere is a shared blind spot, not parity worth
// celebrating — call it out so an empty-vs-empty match can't read as a pass.
if (a.stories.length === 0 && b.stories.length === 0) {
  console.log('NOTE: both recaptured nothing — shared blind spot, not a parity win.');
}
if (v2Stories.length === 0) {
  console.log('NOTE: v2 indexed 0 stories for this fixture — no verdict here is meaningful.');
}

console.log(`VERDICT: ${verdict}`);
process.exit(failed ? 1 : 0);
