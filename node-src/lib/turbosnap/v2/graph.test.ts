import { describe, expect, it } from 'vitest';

import {
  collectTransitiveDependencies,
  FileHash,
  FilePath,
  hashEntryIdentities,
  hashEntryIdentity,
  rollUpEntryHashes,
  rollUpFileHashes,
  TurboSnapFile,
} from './graph';

// An identity "hash" so these tests can assert on the exact bytes that reach the hash function.
// What matters here is the encoding, not xxhash itself.
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

describe('hashEntryIdentity', () => {
  it('length-prefixes both the key and the value', () => {
    expect(hashEntryIdentity(['a.ts', 'H1'])).toBe('4:a.ts2:H1');
  });

  it('keeps two entries distinct when the same bytes split differently between key and value', () => {
    // Without the length prefixes both of these encode to `abc`, so a file at path `ab` hashing to
    // `c` would be indistinguishable from one at `a` hashing to `bc`.
    expect(hashEntryIdentity(['ab', 'c'])).not.toBe(hashEntryIdentity(['a', 'bc']));
  });

  it('puts the key before the value', () => {
    // A swap would still be collision-free, but every previously published hash would change.
    expect(hashEntryIdentity(['k', 'v'])).toBe('1:k1:v');
  });

  it('encodes an empty value distinctly from an absent one being empty too', () => {
    expect(hashEntryIdentity(['a.ts', ''])).toBe('4:a.ts0:');
  });
});

describe('hashEntryIdentities', () => {
  it('sorts entries so iteration order does not reach the hash', () => {
    const forwards = hashEntryIdentities([
      ['a.ts', 'H1'],
      ['b.ts', 'H2'],
    ]);
    const backwards = hashEntryIdentities([
      ['b.ts', 'H2'],
      ['a.ts', 'H1'],
    ]);

    expect(forwards).toBe(backwards);
  });

  it('cannot encode two different entry sets to the same bytes', () => {
    // The length prefixes are what make the concatenation unambiguous once entries are joined.
    expect(
      hashEntryIdentities([
        ['ab', 'c'],
        ['d', 'e'],
      ])
    ).not.toBe(
      hashEntryIdentities([
        ['a', 'bc'],
        ['d', 'e'],
      ])
    );
  });

  it('distinguishes a renamed key from an unchanged one', () => {
    expect(hashEntryIdentities([['a.ts', 'H1']])).not.toBe(hashEntryIdentities([['b.ts', 'H1']]));
  });
});

describe('rollUpEntryHashes', () => {
  it('hashes the encoded entries', () => {
    expect(
      rollUpEntryHashes(
        [
          ['a.ts', 'H1'],
          ['b.ts', 'H2'],
        ],
        identity
      )
    ).toBe('4:a.ts2:H14:b.ts2:H2');
  });
});

describe('rollUpFileHashes', () => {
  const hashes = new Map<FilePath, FileHash>([
    ['./a.ts', 'H1'],
    ['./b.ts', 'H2'],
  ]);

  it('looks each file up by path and rolls the pairs together', () => {
    expect(rollUpFileHashes(hashes, ['./a.ts', './b.ts'], identity)).toBe(
      '6:./a.ts2:H16:./b.ts2:H2'
    );
  });

  it('does not depend on the order the files are supplied in', () => {
    expect(rollUpFileHashes(hashes, ['./b.ts', './a.ts'], identity)).toBe(
      rollUpFileHashes(hashes, ['./a.ts', './b.ts'], identity)
    );
  });

  it('substitutes an empty content hash for a file with no entry in `hashes`', () => {
    // Synthetic nodes (globs, externals, virtual modules) are walked but never hashed. They still
    // contribute their path, so the roll-up records that they were part of the subtree.
    expect(rollUpFileHashes(hashes, ['virtual:stories'], identity)).toBe('15:virtual:stories0:');
  });

  it('changes when a file moves, even though its content is identical', () => {
    // A file's path reaches the output, so the same bytes at a new path have to move the hash.
    const moved = new Map<FilePath, FileHash>([['./moved/a.ts', 'H1']]);

    expect(rollUpFileHashes(moved, ['./moved/a.ts'], identity)).not.toBe(
      rollUpFileHashes(hashes, ['./a.ts'], identity)
    );
  });

  it('changes when a file is added to the subtree', () => {
    expect(rollUpFileHashes(hashes, ['./a.ts'], identity)).not.toBe(
      rollUpFileHashes(hashes, ['./a.ts', './b.ts'], identity)
    );
  });
});

describe('collectTransitiveDependencies', () => {
  it('includes the file itself', () => {
    const files = makeFiles({ './a.ts': [] });

    expect([...collectTransitiveDependencies(files, './a.ts')]).toEqual(['./a.ts']);
  });

  it('walks through intermediate files to the leaves', () => {
    const files = makeFiles({ './a.ts': ['./b.ts'], './b.ts': ['./c.ts'], './c.ts': [] });

    expect([...collectTransitiveDependencies(files, './a.ts')].sort()).toEqual([
      './a.ts',
      './b.ts',
      './c.ts',
    ]);
  });

  it('terminates on a dependency cycle', () => {
    // Circular imports are legal in JS and do occur, so the visited guard is what keeps this from
    // recursing until the stack overflows.
    const files = makeFiles({ './a.ts': ['./b.ts'], './b.ts': ['./a.ts'] });

    expect([...collectTransitiveDependencies(files, './a.ts')].sort()).toEqual([
      './a.ts',
      './b.ts',
    ]);
  });

  it('terminates on a file that depends on itself', () => {
    const files = makeFiles({ './a.ts': ['./a.ts'] });

    expect([...collectTransitiveDependencies(files, './a.ts')]).toEqual(['./a.ts']);
  });

  it('returns just the file itself when it has no node in the graph', () => {
    // Synthetic nodes are referenced as dependencies without ever being added as keys.
    expect([...collectTransitiveDependencies(new Map(), 'virtual:stories')]).toEqual([
      'virtual:stories',
    ]);
  });

  it('accumulates into a supplied set across calls, and returns that same set', () => {
    // `collectStorybookFiles` unions every story's subtree by reusing one accumulator this way.
    const files = makeFiles({ './a.ts': ['./shared.ts'], './b.ts': ['./shared.ts'] });
    const accumulator = new Set<FilePath>();

    collectTransitiveDependencies(files, './a.ts', accumulator);
    const returned = collectTransitiveDependencies(files, './b.ts', accumulator);

    expect(returned).toBe(accumulator);
    expect([...accumulator].sort()).toEqual(['./a.ts', './b.ts', './shared.ts']);
  });
});
