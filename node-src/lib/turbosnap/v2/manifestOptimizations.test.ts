import { describe, expect, it } from 'vitest';

import {
  collectTransitiveDependencies,
  FileHash,
  FilePath,
  rollUpFileHashes,
  SKIPPED_HASH,
  TurboSnapFile,
} from './graph';
import { createManifestFileHasher, createStoryFileHasher } from './manifestOptimizations';

// Compare the exact hash input, without depending on a particular hash implementation.
function identity(input: string): string {
  return input;
}

function makeFiles(graph: Record<FilePath, FilePath[]>): Map<FilePath, TurboSnapFile> {
  return new Map(
    Object.entries(graph).map(([filePath, dependencies]) => [
      filePath,
      { hash: `hash-${filePath}`, dependencies: new Set(dependencies) },
    ])
  );
}

function fileHashes(files: Map<FilePath, TurboSnapFile>): Map<FilePath, FileHash> {
  return new Map([...files].map(([filePath, file]) => [filePath, file.hash]));
}

function expectSameStoryHashes(
  files: Map<FilePath, TurboSnapFile>,
  hashes: Map<FilePath, FileHash>,
  hashStory: (filePath: FilePath) => FileHash,
  filePaths: Iterable<FilePath>
) {
  for (const filePath of filePaths) {
    expect(hashStory(filePath)).toBe(
      rollUpFileHashes(hashes, collectTransitiveDependencies(files, filePath), identity)
    );
  }
}

describe('createManifestFileHasher', () => {
  it('matches encoded-pair ordering for escaped paths, Unicode, empty hashes and duplicates', () => {
    const paths = [
      '',
      './a',
      './a\0',
      './a\t',
      './a\n',
      './a"',
      './a\\',
      './aa',
      './é',
      './中',
      './😀',
      './\uD800',
    ];
    const hashes = new Map(
      paths.map((filePath, index) => [filePath, index === 0 ? '' : `hash${index}中\\"\n\uDFFF`])
    );
    const hashFiles = createManifestFileHasher(hashes, identity);
    const cases = [
      [],
      paths,
      [...paths].reverse(),
      ['./a', './a', './missing', './missing'],
      ['virtual:z', './a', 'virtual:a'],
      ['./a"', './a\n', './a\t', './a\0'],
    ];
    for (const filePaths of cases) {
      expect(hashFiles(filePaths)).toBe(rollUpFileHashes(hashes, filePaths, identity));
      expect(hashFiles(new Set(filePaths))).toBe(
        rollUpFileHashes(hashes, new Set(filePaths), identity)
      );
    }
    const partialHashes = new Map([...hashes].filter((_, index) => index % 2 === 0));
    expect(createManifestFileHasher(partialHashes, identity)([...paths, ...paths])).toBe(
      rollUpFileHashes(partialHashes, [...paths, ...paths], identity)
    );
  });

  it('omits skipped paths entirely while retaining missing paths and empty hashes', () => {
    const hashes = new Map([
      ['generated.ts', SKIPPED_HASH],
      ['empty.ts', ''],
      ['source.ts', 'source-hash'],
    ]);
    const hashFiles = createManifestFileHasher(hashes, identity);
    for (const filePaths of [
      [],
      ['generated.ts', 'generated.ts'],
      ['generated.ts', 'missing.ts', 'empty.ts', 'source.ts', 'missing.ts'],
    ]) {
      expect(hashFiles(filePaths)).toBe(rollUpFileHashes(hashes, filePaths, identity));
    }
    expect(hashFiles(['generated.ts'])).toBe(hashFiles([]));
    expect(hashFiles(['missing.ts'])).not.toBe(hashFiles([]));
  });

  it('consumes a one-use iterable once and calls the hash function once per roll-up', () => {
    const hashes = new Map([['source.ts', 'source-hash']]);
    const hashInputs: string[] = [];
    const hashFiles = createManifestFileHasher(hashes, (input) => {
      hashInputs.push(input);
      return `hashed:${input}`;
    });
    const paths = ['virtual:z', 'source.ts', 'virtual:a', 'source.ts'];
    const iterable = paths.values();
    const expected = rollUpFileHashes(hashes, paths, identity);
    expect(hashFiles(iterable)).toBe(`hashed:${expected}`);
    expect([...iterable]).toEqual([]);
    expect(hashInputs).toEqual([expected]);
    expect(hashFiles([])).toBe('hashed:');
    expect(hashInputs).toEqual([expected, '']);
  });

  it('handles previously unseen paths on later calls and keeps independent builds separate', () => {
    const firstHashes = new Map([['source.ts', 'first']]);
    const secondHashes = new Map([['source.ts', 'second']]);
    const first = createManifestFileHasher(firstHashes, identity);
    const second = createManifestFileHasher(secondHashes, identity);
    for (const filePaths of [
      ['source.ts'],
      ['virtual:later', 'source.ts'],
      ['virtual:later', 'virtual:later'],
    ]) {
      expect(first(filePaths)).toBe(rollUpFileHashes(firstHashes, filePaths, identity));
      expect(second(filePaths)).toBe(rollUpFileHashes(secondHashes, filePaths, identity));
    }
    expect(first(['source.ts'])).not.toBe(second(['source.ts']));
  });
});

describe('createStoryFileHasher', () => {
  it('matches complete roll-ups through shared subtrees, cycles, story cycles and missing nodes', () => {
    const files = makeFiles({
      'first.stories.ts': ['shared.ts', 'local.ts'],
      'second.stories.ts': ['shared.ts'],
      'third.stories.ts': ['local.ts', 'shared.ts'],
      'shared.ts': ['cycle.ts', 'missing.ts'],
      'cycle.ts': ['shared.ts', 'first.stories.ts'],
      'local.ts': ['local.ts', 'leaf.ts'],
      'leaf.ts': [],
    });
    const stories = new Set(['first.stories.ts', 'second.stories.ts', 'third.stories.ts']);
    const hashes = fileHashes(files);
    const hashStory = createStoryFileHasher(files, hashes, stories, identity);
    expectSameStoryHashes(files, hashes, hashStory, [...files.keys(), 'missing.ts', 'unknown.ts']);
    expectSameStoryHashes(files, hashes, hashStory, [...stories].reverse());
  });

  it.each([false, true])(
    'requires the anchor and deduplicates shared members visited before it (reverse=%s)',
    (reverse) => {
      const dependencies = ['shared.ts', 'descendant.ts', 'local.ts'];
      const files = makeFiles({
        'first.stories.ts': reverse ? dependencies.reverse() : dependencies,
        'second.stories.ts': ['shared.ts'],
        'descendant-only.stories.ts': ['descendant.ts'],
        'shared.ts': ['descendant.ts', 'sibling.ts'],
        'descendant.ts': [],
        'sibling.ts': [],
        'local.ts': ['descendant.ts'],
      });
      const stories = new Set([
        'first.stories.ts',
        'second.stories.ts',
        'descendant-only.stories.ts',
      ]);
      const hashes = fileHashes(files);
      const hashStory = createStoryFileHasher(files, hashes, stories, identity);
      expectSameStoryHashes(files, hashes, hashStory, files.keys());
      expect(hashStory('descendant-only.stories.ts')).toBe(
        rollUpFileHashes(hashes, ['descendant-only.stories.ts', 'descendant.ts'], identity)
      );
    }
  );

  it('merges exact encoded-pair order across escaped paths, Unicode, missing and empty hashes', () => {
    const sharedPaths = ['', './a\0', './a\t', './a"', './aa', './中', './\uD800'];
    const extraPaths = ['./a', './a\n', './a\\', './é', './😀', './\uDFFF', 'virtual:missing'];
    const files = makeFiles({
      'first.stories.ts': ['shared.ts', ...extraPaths],
      'second.stories.ts': [...[...extraPaths].reverse(), 'shared.ts'],
      'shared.ts': sharedPaths,
      ...Object.fromEntries(sharedPaths.map((filePath) => [filePath, []])),
    });
    const hashes = fileHashes(files);
    hashes.set('shared.ts', SKIPPED_HASH);
    hashes.set('', '');
    hashes.set('./a\0', 'hash中\\"\n\uDFFF');
    hashes.delete('./aa');
    hashes.set('./é', 'external-hash');
    const stories = new Set(['first.stories.ts', 'second.stories.ts']);
    const inputs: string[] = [];
    const hashStory = createStoryFileHasher(files, hashes, stories, (input) => {
      inputs.push(input);
      return input;
    });
    const roots = [...stories, 'shared.ts', 'virtual:later'];
    expect(inputs).toEqual([]);
    expectSameStoryHashes(files, hashes, hashStory, roots);
    expect(inputs).toEqual(
      roots.map((root) =>
        rollUpFileHashes(hashes, collectTransitiveDependencies(files, root), identity)
      )
    );
  });

  it('handles an entirely skipped cached closure without losing empty or missing story hashes', () => {
    const files = makeFiles({
      'first.stories.ts': ['shared.ts'],
      'second.stories.ts': ['shared.ts'],
      'shared.ts': ['leaf.ts'],
      'leaf.ts': [],
    });
    const hashes = new Map([
      ['shared.ts', SKIPPED_HASH],
      ['leaf.ts', SKIPPED_HASH],
      ['first.stories.ts', ''],
    ]);
    const stories = new Set(['first.stories.ts', 'second.stories.ts']);
    const hashStory = createStoryFileHasher(files, hashes, stories, identity);
    expectSameStoryHashes(files, hashes, hashStory, files.keys());
    expect(hashStory('shared.ts')).toBe('');
    expect(hashStory('second.stories.ts')).toBe(
      rollUpFileHashes(hashes, ['second.stories.ts'], identity)
    );
  });

  it('matches ordinary roll-ups when there is no shared anchor', () => {
    const files = makeFiles({
      'single.stories.ts': ['middle.ts'],
      'middle.ts': ['leaf.ts'],
      'leaf.ts': [],
    });
    const hashes = fileHashes(files);
    const hashStory = createStoryFileHasher(
      files,
      hashes,
      new Set(['single.stories.ts']),
      identity
    );
    expectSameStoryHashes(files, hashes, hashStory, [...files.keys(), 'unknown.ts']);
    expect(createStoryFileHasher(new Map(), new Map(), new Set(), identity)('missing.ts')).toBe(
      rollUpFileHashes(new Map(), ['missing.ts'], identity)
    );
  });

  it('keeps graphs, hashes and later calls independent', () => {
    const firstFiles = makeFiles({
      'first.stories.ts': ['shared.ts'],
      'second.stories.ts': ['shared.ts'],
      'shared.ts': ['old.ts'],
    });
    const secondFiles = makeFiles({
      'first.stories.ts': ['shared.ts'],
      'second.stories.ts': ['shared.ts'],
      'shared.ts': ['new.ts'],
    });
    const firstHashes = fileHashes(firstFiles);
    const secondHashes = fileHashes(secondFiles);
    secondHashes.set('shared.ts', 'changed-content');
    const stories = new Set(['first.stories.ts', 'second.stories.ts']);
    const first = createStoryFileHasher(firstFiles, firstHashes, stories, identity);
    const second = createStoryFileHasher(secondFiles, secondHashes, stories, identity);
    expectSameStoryHashes(firstFiles, firstHashes, first, stories);
    expectSameStoryHashes(secondFiles, secondHashes, second, stories);
    expectSameStoryHashes(firstFiles, firstHashes, first, [...stories].reverse());
    expect(first('first.stories.ts')).not.toBe(second('first.stories.ts'));
  });

  it.each([
    { size: 65_536, dangling: false },
    { size: 65_537, dangling: false },
    { size: 65_536, dangling: true },
  ])(
    'preserves roll-ups at the graph-key bound ($size files, dangling=$dangling)',
    ({ size, dangling }) => {
      const files = makeFiles({
        'first.stories.ts': ['shared.ts'],
        'second.stories.ts': ['shared.ts'],
        'shared.ts': ['leaf.ts'],
        'leaf.ts': ['shared.ts'],
      });
      for (let index = files.size; index < size; index++) {
        files.set(`isolated-${index}.ts`, { hash: '', dependencies: new Set() });
      }
      if (dangling) files.get('shared.ts')?.dependencies.add('missing.ts');
      const hashes = fileHashes(files);
      const stories = new Set(['first.stories.ts', 'second.stories.ts']);
      const hashStory = createStoryFileHasher(files, hashes, stories, identity);
      expectSameStoryHashes(files, hashes, hashStory, [...stories, 'shared.ts', 'missing.ts']);
    }
  );

  it('retains dependencies through skipped barrels while omitting their own identity', () => {
    const files = makeFiles({
      'first.stories.ts': ['generated.ts'],
      'second.stories.ts': ['generated.ts'],
      'generated.ts': ['tracked.ts'],
      'tracked.ts': [],
    });
    const hashes = new Map<FilePath, FileHash>([
      ['first.stories.ts', SKIPPED_HASH],
      ['second.stories.ts', 'story-hash'],
      ['generated.ts', SKIPPED_HASH],
      ['tracked.ts', 'tracked-hash'],
    ]);
    const stories = new Set(['first.stories.ts', 'second.stories.ts']);
    const hashStory = createStoryFileHasher(files, hashes, stories, identity);
    for (const story of stories) {
      expectSameStoryHashes(files, hashes, hashStory, [story]);
      expect(hashStory(story)).not.toBe(rollUpFileHashes(hashes, [story], identity));
    }
  });
});
