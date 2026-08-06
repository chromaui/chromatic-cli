#!/usr/bin/env node
// structural-verdict.mjs <case> <base-manifest> <cur-manifest> <base-story-ids> <cur-story-ids>
//
// Turns structural-probe.sh's human-readable diagnostics into a machine-checkable gate. Expectations
// are expressed in terms of public manifest output: the exact story-file and storybookFiles keys
// whose hashes changed, plus story-ID changes where a case is specifically about Storybook identity.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const [caseName, baseFile, currentFile, baseIdsFile, currentIdsFile] = process.argv.slice(2);
if (!caseName || !baseFile || !currentFile || !baseIdsFile || !currentIdsFile) {
  console.error(
    'usage: node structural-verdict.mjs <case> <base.json> <cur.json> <base.ids> <cur.ids>'
  );
  process.exit(2);
}

const expectations = {
  'new-import': {
    stories: ['Button.stories.tsx'],
    storybookFiles: [],
  },
  'new-story': {
    stories: ['BadgeExtra.stories.tsx'],
    storybookFiles: [],
  },
  'delete-story': {
    stories: ['Badge.stories.tsx'],
    storybookFiles: [],
  },
  'move-module': {
    stories: ['Button.stories.tsx'],
    storybookFiles: ['preview.ts'],
  },
  'move-component': {
    stories: ['Badge.stories.tsx', 'UserCard.stories.tsx'],
    storybookFiles: [],
  },
  'move-path-derived': {
    stories: ['PathDerived.stories.tsx', 'PathDerivedShared.stories.tsx'],
    storybookFiles: [],
  },
  'move-package': {
    stories: ['Badge.stories.tsx', 'UserCard.stories.tsx'],
    storybookFiles: [],
  },
  'move-story': {
    stories: ['Badge.stories.tsx', 'BadgeRenamed.stories.tsx'],
    storybookFiles: [],
    storyIds: 'same',
  },
  'move-story-autotitle': {
    stories: ['AutoTitle.stories.tsx', 'AutoTitle.stories.tsx'],
    storybookFiles: [],
    storyIds: 'changed',
  },
  'new-dep': {
    stories: ['Button.stories.tsx'],
    storybookFiles: [],
  },
  'remove-import': {
    stories: ['Button.stories.tsx'],
    storybookFiles: [],
  },
  'remove-dep': {
    stories: ['Button.stories.tsx'],
    storybookFiles: [],
  },
  'orphan-to-bucket': {
    stories: ['Button.stories.tsx'],
    storybookFiles: ['<storybookGlobals>'],
  },
};

const expectation = expectations[caseName];
if (!expectation) {
  console.error(`no structural expectation for ${caseName}`);
  process.exit(2);
}

const base = JSON.parse(readFileSync(baseFile, 'utf8'));
const current = JSON.parse(readFileSync(currentFile, 'utf8'));

function changedKeys(before = {}, after = {}) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => before[key] !== after[key])
    .sort();
}

const changedStories = changedKeys(base.storyFiles, current.storyFiles).map((key) =>
  path.basename(key)
);
const changedStorybookFiles = changedKeys(base.storybookFiles, current.storybookFiles).map((key) =>
  path.basename(key)
);

const expectedStories = [...expectation.stories].sort();
const expectedStorybookFiles = [...expectation.storybookFiles].sort();
const failures = [];

if (JSON.stringify(changedStories) !== JSON.stringify(expectedStories)) {
  failures.push(
    `stories changed: expected ${expectedStories.join(', ') || '(none)'}, got ${changedStories.join(', ') || '(none)'}`
  );
}
if (JSON.stringify(changedStorybookFiles) !== JSON.stringify(expectedStorybookFiles)) {
  failures.push(
    `storybookFiles changed: expected ${expectedStorybookFiles.join(', ') || '(none)'}, got ${changedStorybookFiles.join(', ') || '(none)'}`
  );
}
if (expectation.storyIds) {
  const storyIdsChanged =
    readFileSync(baseIdsFile, 'utf8') !== readFileSync(currentIdsFile, 'utf8');
  if ((expectation.storyIds === 'changed') !== storyIdsChanged) {
    failures.push(
      `story IDs: expected ${expectation.storyIds}, got ${storyIdsChanged ? 'changed' : 'same'}`
    );
  }
}

if (failures.length > 0) {
  console.error(`FAIL ${caseName}`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`PASS ${caseName}`);
