import { describe, expect, it } from 'vitest';

import {
  collectTransitiveDependencies,
  rollUpFileHashes,
  SKIPPED_HASH,
  TurboSnapFile,
} from './graph';
import { createStoryFileHasher } from './storyFileHasher';

// Compare the bytes passed to xxhash directly.
const identity = (input: string) => input;

function expectOriginalHashInputs(
  graph: Record<string, string[]>,
  stories: string[],
  hashOverrides: Record<string, string> = {}
) {
  const files = new Map<string, TurboSnapFile>();
  const hashes = new Map<string, string>();
  for (const [path, imports] of Object.entries(graph)) {
    const hash = hashOverrides[path] ?? path;
    files.set(path, { hash, dependencies: new Set(imports) });
    hashes.set(path, hash);
  }

  const hashStory = createStoryFileHasher(files, hashes, new Set(stories), identity);
  for (const story of stories) {
    const dependencies = collectTransitiveDependencies(files, story);
    expect(hashStory(story), story).toBe(rollUpFileHashes(hashes, dependencies, identity));
  }
}

describe('createStoryFileHasher', () => {
  it('counts overlapping imports once and only includes the shared subtree when reachable', () => {
    expectOriginalHashInputs(
      {
        'A.stories.ts': ['shared.ts', 'leaf.ts'],
        'B.stories.ts': ['leaf.ts', 'shared.ts'],
        'Leaf.stories.ts': ['leaf.ts'],
        'shared.ts': ['leaf.ts', 'cycle.ts', 'missing.ts'],
        'cycle.ts': ['shared.ts'],
        'leaf.ts': [],
      },
      ['A.stories.ts', 'B.stories.ts', 'Leaf.stories.ts']
    );
  });

  it('merges escaped and Unicode paths in encoded order', () => {
    expectOriginalHashInputs(
      {
        'A.stories.ts': ['shared.ts', 'a".ts', 'b.ts'],
        'B.stories.ts': ['shared.ts', 'a\t.ts'],
        'shared.ts': ['a\n.ts', 'a😀.ts', 'z.ts'],
        'a\n.ts': [],
        'a😀.ts': [],
        'a".ts': [],
        'z.ts': [],
      },
      ['A.stories.ts', 'B.stories.ts'],
      { 'a".ts': '', 'a\n.ts': 'quoted "hash"' }
    );
  });

  it('omits an entirely skipped subtree while retaining private imports', () => {
    expectOriginalHashInputs(
      {
        'A.stories.ts': ['generated.ts', 'tracked.ts'],
        'B.stories.ts': ['generated.ts'],
        'generated.ts': ['generated-child.ts'],
        'generated-child.ts': [],
        'tracked.ts': [],
      },
      ['A.stories.ts', 'B.stories.ts'],
      { 'generated.ts': SKIPPED_HASH, 'generated-child.ts': SKIPPED_HASH }
    );
  });

  it('hashes disjoint stories with only their own dependencies', () => {
    expectOriginalHashInputs(
      {
        'A.stories.ts': ['button.ts'],
        'button.ts': ['icon.ts'],
        'icon.ts': [],
        'B.stories.ts': [],
      },
      ['A.stories.ts', 'B.stories.ts']
    );
  });
});
