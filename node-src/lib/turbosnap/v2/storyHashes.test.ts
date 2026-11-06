import { describe, expect, it } from 'vitest';
import xxHashWasm from 'xxhash-wasm';

import {
  collectTransitiveDependencies,
  FileHash,
  FilePath,
  rollUpFileHashes,
  SKIPPED_HASH,
  TurboSnapFile,
} from './graph';
import { buildRollUpPath } from './paths';
import { hashStorySubtrees } from './storyHashes';

// The contract under test is byte-for-byte parity with the per-story recipe in graph.ts: the hash
// of every story must be what rollUpFileHashes gives for collectTransitiveDependencies. These
// suites compare the two over the real hash function, on graphs built to reach every branch of the
// recipe: skipped files, missing hashes, cycles, dangling dependencies, stories importing stories,
// pnpm peer-suffix roll-up paths and non-ASCII or escaped paths.

interface Graph {
  files: Map<FilePath, TurboSnapFile>;
  hashes: Map<FilePath, FileHash>;
  storyFiles: Set<FilePath>;
}

async function expectParity({ files, hashes, storyFiles }: Graph) {
  const hasher = await xxHashWasm();
  const rollUpPath = buildRollUpPath(hashes.keys());
  const expected = new Map<FilePath, FileHash>();
  for (const storyFile of storyFiles) {
    const subtree = collectTransitiveDependencies(files, storyFile);
    expected.set(storyFile, rollUpFileHashes(hashes, subtree, hasher.h64ToString, rollUpPath));
  }
  expect(hashStorySubtrees(files, hashes, storyFiles, rollUpPath, hasher)).toEqual(expected);
  return expected;
}

function graph(edges: Record<FilePath, FilePath[]>, hashes: Record<FilePath, FileHash>): Graph {
  return {
    files: new Map(
      Object.entries(edges).map(([filePath, dependencies]) => [
        filePath,
        { hash: hashes[filePath] ?? '', dependencies: new Set(dependencies) },
      ])
    ),
    hashes: new Map(Object.entries(hashes)),
    storyFiles: new Set(Object.keys(edges).filter((filePath) => filePath.includes('.stories.'))),
  };
}

describe('hashStorySubtrees', () => {
  it('matches the per-story recipe on a shared, a private and a skipped dependency', async () => {
    const hashes = await expectParity(
      graph(
        {
          './src/Button.stories.tsx': ['./src/Button.tsx', './src/generated.ts'],
          './src/Header.stories.tsx': ['./src/Button.tsx', './src/Header.tsx'],
          './src/Button.tsx': ['./src/tokens.ts'],
          './src/Header.tsx': ['./src/tokens.ts'],
          './src/tokens.ts': [],
          './src/generated.ts': [],
        },
        {
          './src/Button.stories.tsx': '1111111111111111',
          './src/Header.stories.tsx': '2222222222222222',
          './src/Button.tsx': '3333333333333333',
          './src/Header.tsx': '4444444444444444',
          './src/tokens.ts': '5555555555555555',
          './src/generated.ts': SKIPPED_HASH,
        }
      )
    );
    expect(hashes.size).toBe(2);
    expect(hashes.get('./src/Button.stories.tsx')).not.toBe(hashes.get('./src/Header.stories.tsx'));
  });

  it('matches on cycles, dangling dependencies, missing hashes and a story outside the graph', async () => {
    const { files, hashes, storyFiles } = graph(
      {
        './src/A.stories.tsx': ['./src/a.ts', './src/B.stories.tsx', './src/missing.ts'],
        './src/B.stories.tsx': ['./src/b.ts'],
        './src/a.ts': ['./src/b.ts', './src/A.stories.tsx'],
        './src/b.ts': ['./src/a.ts', './src/b.ts'],
      },
      {
        './src/A.stories.tsx': 'aaaaaaaaaaaaaaaa',
        './src/B.stories.tsx': 'bbbbbbbbbbbbbbbb',
        './src/a.ts': 'cccccccccccccccc',
        './src/missing.ts': 'dddddddddddddddd',
      }
    );
    storyFiles.add('./src/Outside.stories.tsx');
    const result = await expectParity({ files, hashes, storyFiles });
    expect(result.size).toBe(3);
  });

  it('matches when every file in a subtree is skipped', async () => {
    const { files, hashes, storyFiles } = graph(
      { './src/A.stories.tsx': ['./src/a.ts'], './src/a.ts': [] },
      { './src/A.stories.tsx': SKIPPED_HASH, './src/a.ts': SKIPPED_HASH }
    );
    const result = await expectParity({ files, hashes, storyFiles });
    const { h64ToString } = await xxHashWasm();
    expect(result.get('./src/A.stories.tsx')).toBe(h64ToString(''));
  });

  it('matches on pnpm peer-suffixed copies and non-ASCII or escaped paths', async () => {
    const store = './node_modules/.pnpm';
    const single = `${store}/single@1.0.0_react@19.0.0/node_modules/single/index.js`;
    const copyA = `${store}/multi@1.0.0_react@18.0.0/node_modules/multi/index.js`;
    const copyB = `${store}/multi@1.0.0_react@19.0.0/node_modules/multi/index.js`;
    const unicode = './src/compönents/日本語/Ünïcode.stories.tsx';
    const escaped = String.raw`./src/quo"te\back\nslash.ts`;
    // Astral and U+E000–U+FFFF characters sort differently by UTF-16 code unit than by UTF-8 byte.
    const astral = './src/\u{1F600}.ts';
    const fullwidth = './src/\uFF5E.ts';
    await expectParity(
      graph(
        {
          [unicode]: [single, copyA, escaped, astral, fullwidth],
          './src/Other.stories.tsx': [single, copyB, escaped],
          [single]: [],
          [copyA]: [],
          [copyB]: [],
          [escaped]: [],
          [astral]: [],
          [fullwidth]: [],
        },
        {
          [unicode]: '1111111111111111',
          './src/Other.stories.tsx': '2222222222222222',
          [single]: '3333333333333333',
          [copyA]: '4444444444444444',
          [copyB]: '5555555555555555',
          [escaped]: '6666666666666666',
          [astral]: '7777777777777777',
          [fullwidth]: '8888888888888888',
        }
      )
    );
  });

  it('matches when one story outgrows the scratch buffers', async () => {
    // Over 1,024 reachable files grows the walk's stack and found buffers, and long paths push the
    // story's hash input past the 64 KiB output buffer. The big story reaches every other file in
    // sorted order, so each reached rank is its own run and the runs buffer grows too. A small
    // story hashed after it reuses the grown buffers.
    const directory = `./src/${'deeply-nested-folder/'.repeat(6)}`;
    const files = Array.from(
      { length: 2250 },
      (_, index) => `${directory}module-${`${index}`.padStart(4, '0')}.ts`
    );
    const reached = files.filter((_, index) => index % 2 === 1);
    const edges: Record<FilePath, FilePath[]> = {
      './src/Big.stories.tsx': reached,
      './src/Small.stories.tsx': [files[0], files[2]],
    };
    const hashes: Record<FilePath, FileHash> = {
      './src/Big.stories.tsx': '1111111111111111',
      './src/Small.stories.tsx': '2222222222222222',
    };
    for (const [index, filePath] of files.entries()) {
      edges[filePath] = [];
      hashes[filePath] = `${index}`.padStart(16, '0');
    }
    await expectParity(graph(edges, hashes));
  });

  it('matches the recipe on random graphs, including subtrees large enough for the bitset scan', async () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const pick = (count: number) => Math.floor(random() * count);
    for (let round = 0; round < 60; round += 1) {
      const count = 20 + pick(400);
      const paths = Array.from({ length: count }, (_, index) =>
        index % 7 === 0
          ? `./src/Story${index}.stories.tsx`
          : `./src/file${index}${index % 11 === 0 ? 'ü' : ''}.ts`
      );
      const edges: Record<FilePath, FilePath[]> = {};
      const hashes: Record<FilePath, FileHash> = {};
      for (const [index, filePath] of paths.entries()) {
        const degree = pick(4);
        edges[filePath] = Array.from({ length: degree }, () =>
          random() < 0.05 ? `./src/dangling${pick(5)}.ts` : paths[pick(count)]
        );
        if (random() < 0.3) edges[filePath].push(paths[pick(count)]);
        const roll = random();
        if (roll < 0.05) hashes[filePath] = SKIPPED_HASH;
        else if (roll < 0.95) hashes[filePath] = `${index}`.padStart(16, 'f');
      }
      await expectParity(graph(edges, hashes));
    }
  });
});
