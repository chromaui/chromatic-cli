import { describe, expect, it } from 'vitest';

import { FileHash, FilePath, TurboSnapFile } from './graph';
import { collectStorybookFiles, STORYBOOK_GLOBALS_KEY } from './storybookFiles';

// An identity "hash" so a roll-up is readable as the set of paths that went into it, which is what
// makes a leak between two preview subtrees visible.
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

function makeHashes(filePaths: FilePath[]): Map<FilePath, FileHash> {
  return new Map(filePaths.map((filePath) => [filePath, `hash-${filePath}`]));
}

describe('collectStorybookFiles', () => {
  it('keys an entry by each preview config path', () => {
    const files = makeFiles({ './.storybook/preview.ts': [], './src/a.stories.tsx': [] });
    const hashes = makeHashes(['./.storybook/preview.ts', './src/a.stories.tsx']);

    const { storybookFiles } = collectStorybookFiles(
      files,
      hashes,
      new Set(['./src/a.stories.tsx']),
      identity
    );

    expect([...storybookFiles.keys()]).toContain('./.storybook/preview.ts');
  });

  it('matches every preview config extension Storybook accepts', () => {
    const previews = [
      './.storybook/preview.ts',
      './.storybook/preview.tsx',
      './.storybook/preview.js',
      './.storybook/preview.jsx',
      './.storybook/preview.mjs',
      './.storybook/preview.cjs',
    ];
    const { storybookFiles } = collectStorybookFiles(
      makeFiles(Object.fromEntries(previews.map((p) => [p, []]))),
      makeHashes(previews),
      new Set(),
      identity
    );

    expect([...storybookFiles.keys()].sort()).toEqual([...previews].sort());
  });

  it('does not treat a file merely named preview outside .storybook as a config', () => {
    const files = makeFiles({ './src/preview.ts': [] });

    const { storybookFiles, attribution } = collectStorybookFiles(
      files,
      makeHashes(['./src/preview.ts']),
      new Set(),
      identity
    );

    expect([...storybookFiles.keys()]).toEqual([STORYBOOK_GLOBALS_KEY]);
    expect([...attribution.storybookGlobals]).toEqual(['./src/preview.ts']);
  });

  it('keeps two preview subtrees out of each other rolled-up hashes', () => {
    // Each subtree is collected on its own; sharing one accumulator would fold the first preview's
    // files into the second's entry, so a change to one would move the other's hash.
    const files = makeFiles({
      './.storybook/preview.ts': ['./.storybook/themeA.ts'],
      './.storybook/themeA.ts': [],
      './packages/other/.storybook/preview.ts': ['./packages/other/.storybook/themeB.ts'],
      './packages/other/.storybook/themeB.ts': [],
    });
    const hashes = makeHashes([...files.keys()]);

    const { storybookFiles } = collectStorybookFiles(files, hashes, new Set(), identity);

    expect(storybookFiles.get('./packages/other/.storybook/preview.ts')).not.toContain('themeA');
    expect(storybookFiles.get('./.storybook/preview.ts')).not.toContain('themeB');
  });

  it('rolls files reached by no story and no preview into the catch-all', () => {
    const files = makeFiles({ './node_modules/react-dom/index.js': [] });

    const { storybookFiles, attribution } = collectStorybookFiles(
      files,
      makeHashes(['./node_modules/react-dom/index.js']),
      new Set(),
      identity
    );

    expect([...storybookFiles.keys()]).toEqual([STORYBOOK_GLOBALS_KEY]);
    expect([...attribution.storybookGlobals]).toEqual(['./node_modules/react-dom/index.js']);
  });

  it('omits the catch-all entirely when every file has a home', () => {
    const files = makeFiles({
      './src/a.stories.tsx': ['./src/button.tsx'],
      './src/button.tsx': [],
    });

    const { storybookFiles } = collectStorybookFiles(
      files,
      makeHashes(['./src/a.stories.tsx', './src/button.tsx']),
      new Set(['./src/a.stories.tsx']),
      identity
    );

    expect([...storybookFiles.keys()]).toEqual([]);
  });

  it('rolls a file hashed but absent from the graph into the catch-all', () => {
    // A file inside a concatenated module is hashed but recorded only under the concatenation root,
    // so deriving the catch-all from `files` rather than `hashes` would leave it hashed nowhere.
    const { attribution } = collectStorybookFiles(
      makeFiles({}),
      makeHashes(['./src/inlined.ts']),
      new Set(),
      identity
    );

    expect([...attribution.storybookGlobals]).toEqual(['./src/inlined.ts']);
  });

  it('partitions every hashed file into at least one home', () => {
    const files = makeFiles({
      './src/a.stories.tsx': ['./src/button.tsx'],
      './src/button.tsx': [],
      './.storybook/preview.ts': ['./.storybook/theme.ts'],
      './.storybook/theme.ts': [],
      './node_modules/react-dom/index.js': [],
    });
    const hashes = makeHashes([...files.keys()]);

    const { attribution } = collectStorybookFiles(
      files,
      hashes,
      new Set(['./src/a.stories.tsx']),
      identity
    );

    const homed = new Set([
      ...attribution.storyReachable,
      ...attribution.previewSubtree,
      ...attribution.storybookGlobals,
    ]);
    expect([...homed].sort()).toEqual([...hashes.keys()].sort());
  });

  it('reports a file in both a story subtree and a preview subtree under both homes', () => {
    // The two named homes are not mutually exclusive; only the catch-all is defined by absence.
    const shared = './src/tokens.ts';
    const files = makeFiles({
      './src/a.stories.tsx': [shared],
      './.storybook/preview.ts': [shared],
      [shared]: [],
    });

    const { attribution } = collectStorybookFiles(
      files,
      makeHashes([...files.keys()]),
      new Set(['./src/a.stories.tsx']),
      identity
    );

    expect(attribution.storyReachable.has(shared)).toBe(true);
    expect(attribution.previewSubtree.has(shared)).toBe(true);
    expect(attribution.storybookGlobals.has(shared)).toBe(false);
  });

  it('leaves synthetic nodes out of the attribution, since they are never hashed', () => {
    // The walks pass through globs, externals and virtual modules; only real files are reported.
    const files = makeFiles({
      './src/a.stories.tsx': ['virtual:stories'],
      'virtual:stories': [],
      './.storybook/preview.ts': ['glob:./src/**'],
      'glob:./src/**': [],
    });

    const { attribution } = collectStorybookFiles(
      files,
      makeHashes(['./src/a.stories.tsx', './.storybook/preview.ts']),
      new Set(['./src/a.stories.tsx']),
      identity
    );

    expect([...attribution.storyReachable]).toEqual(['./src/a.stories.tsx']);
    expect([...attribution.previewSubtree]).toEqual(['./.storybook/preview.ts']);
  });

  it('skips a preview config that has no content hash', () => {
    const files = makeFiles({ './.storybook/preview.ts': [] });

    const { storybookFiles } = collectStorybookFiles(files, new Map(), new Set(), identity);

    expect([...storybookFiles.keys()]).toEqual([]);
  });
});
