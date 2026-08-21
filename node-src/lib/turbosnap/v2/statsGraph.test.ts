import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import { createFixture } from './__fixtures__/manifestFixtures';
import { readStatsGraph } from './statsGraph';

// These suites are about builder spellings: what webpack, rspack and Vite each call the same file,
// and what the graph reader makes of it. They assert on the graph, not on a hash — that the right
// edge exists and the right bytes were hashed. Whether an edge reaches a roll-up is graph.test.ts's
// job, and end-to-end in manifest.hashing.test.ts.

describe('readStatsGraph concatenated modules', () => {
  // Webpack/rspack concatenate the story and its local imports into one module: the module name
  // carries a ` + N modules` suffix and the real files live in `module.modules`.
  const concatenatedStory: Stats = {
    modules: [
      {
        id: 1,
        name: '/repo/packages/ui/src/Button.stories.tsx + 1 modules',
        modules: [
          { name: '/repo/packages/ui/src/Button.stories.tsx' },
          { name: '/repo/packages/ui/src/Button.tsx' },
        ],
        reasons: [{ moduleName: './storybook-stories.js' }],
      },
    ],
  };

  it('keys the story by its root file, stripping the concatenation suffix', async () => {
    const { input } = createFixture({
      fileHashes: {
        '/repo/packages/ui/src/Button.stories.tsx': 'S',
        '/repo/packages/ui/src/Button.tsx': 'B',
      },
    });
    const graph = await readStatsGraph(concatenatedStory, input);

    expect([...graph.storyFiles]).toEqual(['./src/Button.stories.tsx']);
  });

  it('records each concatenated sub-file as a dependency of the root file, hashed by its own bytes', async () => {
    const { input } = createFixture({
      fileHashes: {
        '/repo/packages/ui/src/Button.stories.tsx': 'S',
        '/repo/packages/ui/src/Button.tsx': 'B',
      },
    });
    const graph = await readStatsGraph(concatenatedStory, input);

    expect([...(graph.files.get('./src/Button.stories.tsx')?.dependencies ?? [])]).toContain(
      './src/Button.tsx'
    );
    expect(graph.hashes.get('./src/Button.tsx')).toBe('B');
  });

  // `storybook-builder-rsbuild` 3.3.0/3.3.1 fill `modules` with the record's require-contexts rather
  // than its concatenated files, and omit the root file. Reading the root from `modules` then yields
  // a glob, which has no file on disk, so the whole record is promoted to a story importer and every
  // module that imports it becomes a story file.
  const contextsInModules: Stats = {
    modules: [
      {
        id: 1,
        name: './node_modules/storybook/dist/csf/index.js + 11 modules',
        modules: [{ name: './node_modules/storybook/dist/csf/*.js' }],
        reasons: [{ moduleName: './storybook-config-entry.js' }],
      },
      {
        id: 2,
        name: './node_modules/storybook/dist/instrumenter/index.js',
        reasons: [{ moduleName: './node_modules/storybook/dist/csf/index.js + 11 modules' }],
      },
    ],
  };

  it('roots a module at its own name when `modules` holds contexts rather than concatenated files', async () => {
    // The glob has no file on disk, which is what would promote the record to a story importer if
    // the root were read from `modules`.
    const { input } = createFixture({
      isAbsent: (candidate) => candidate.includes('*.js'),
      fileHashes: {
        '/repo/packages/ui/node_modules/storybook/dist/csf/index.js': 'C',
        '/repo/packages/ui/node_modules/storybook/dist/instrumenter/index.js': 'I',
      },
    });

    const graph = await readStatsGraph(contextsInModules, input);

    // The record keys by its own name, so it stays a real file rather than becoming a story
    // importer, and the module it imports is not a story file.
    expect(graph.files.has('./node_modules/storybook/dist/csf/index.js')).toBe(true);
    expect([...graph.storyFiles]).toEqual([]);
  });
});

describe('readStatsGraph unhashable paths', () => {
  it('skips a module named after a directory rather than failing the read', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    // rspack names one record after a directory on `storybook-builder-rsbuild` 3.3.0/3.3.1. Reading
    // it throws EISDIR, which would fail the whole manifest to an internalError bail.
    const directory = '/repo/packages/ui/node_modules/@storybook/react/dist/';

    const { input } = createFixture({
      fileHashes: { [story]: 'S' },
      // The record's `modules` entry is a directory on disk; reading it throws EISDIR, so the adapter
      // reports it as not a file and the sweep skips it.
      directories: { [directory]: [] },
    });
    const graph = await readStatsGraph(
      {
        modules: [
          { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: story, modules: [{ name: directory }], reasons: [] },
        ],
      },
      input
    );

    expect([...graph.storyFiles]).toEqual(['./src/Button.stories.tsx']);
    expect(graph.hashes.has('./node_modules/@storybook/react/dist')).toBe(false);
  });
});

describe('readStatsGraph suffix-equivalent story importer identity', () => {
  it('reads the same graph when only the story-entry reason gains a concatenation suffix', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const stats = (storyImporter: string): Stats => ({
      modules: [{ id: 1, name: story, reasons: [{ moduleName: storyImporter }] }],
    });
    const { input } = createFixture({ fileHashes: { [story]: 'S' } });

    const plain = await readStatsGraph(stats('./storybook-stories.js'), input);
    const concatenated = await readStatsGraph(stats('./storybook-stories.js + 1 modules'), input);

    expect(concatenated).toEqual(plain);
  });
});

describe('readStatsGraph concatenated modules with rspack-style child names', () => {
  // rspack labels a concatenated child's `name` with the parent group name (e.g.
  // `./Button.stories.tsx + 1 modules`) rather than the child's own file. The real path is only in
  // `nameForCondition`. Without reading `nameForCondition` the child collapses onto the root file
  // and its content is never hashed.
  const rspackConcatenatedStory: Stats = {
    modules: [
      {
        id: 1,
        name: '/repo/packages/ui/src/Button.stories.tsx + 1 modules',
        nameForCondition: '/repo/packages/ui/src/Button.stories.tsx',
        modules: [
          {
            name: '/repo/packages/ui/src/Button.stories.tsx',
            nameForCondition: '/repo/packages/ui/src/Button.stories.tsx',
          },
          {
            // The buggy child: `name` is the group label, real file is in nameForCondition.
            name: '/repo/packages/ui/src/Button.stories.tsx + 1 modules',
            nameForCondition: '/repo/packages/ui/src/Button.tsx',
          },
        ],
        reasons: [{ moduleName: './storybook-stories.js' }],
      },
    ],
  };

  it('recovers the concatenated child file from nameForCondition and hashes its own bytes', async () => {
    const { input } = createFixture({
      fileHashes: {
        '/repo/packages/ui/src/Button.stories.tsx': 'S',
        '/repo/packages/ui/src/Button.tsx': 'B',
      },
    });
    const graph = await readStatsGraph(rspackConcatenatedStory, input);

    expect([...graph.storyFiles]).toEqual(['./src/Button.stories.tsx']);
    expect([...(graph.files.get('./src/Button.stories.tsx')?.dependencies ?? [])]).toContain(
      './src/Button.tsx'
    );
    expect(graph.hashes.get('./src/Button.tsx')).toBe('B');
  });

  it('reads the same graph as minimal stats that re-emit the concatenated files by usable name', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const implementation = '/repo/packages/ui/src/Button.tsx';
    const shimmedStats: Stats = {
      modules: [
        { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: implementation, reasons: [{ moduleName: story }] },
      ],
    };
    const { input } = createFixture({ fileHashes: { [story]: 'S', [implementation]: 'B' } });

    const full = await readStatsGraph(rspackConcatenatedStory, input);
    const shimmed = await readStatsGraph(shimmedStats, input);

    expect(shimmed).toEqual(full);
  });
});

describe('readStatsGraph missing names', () => {
  it('skips reasons with a null moduleName without dropping the story', async () => {
    const { input } = createFixture({
      fileHashes: { '/repo/packages/ui/src/Button.stories.tsx': 'S' },
    });
    const stats: Stats = {
      modules: [
        {
          id: 1,
          name: '/repo/packages/ui/src/Button.stories.tsx',
          // An entry reason carries `moduleName: null`; the stories-entry reason must still apply.
          reasons: [
            { moduleName: null as unknown as string },
            { moduleName: './storybook-stories.js' },
          ],
        },
      ],
    };

    const graph = await readStatsGraph(stats, input);

    expect([...graph.storyFiles]).toEqual(['./src/Button.stories.tsx']);
  });

  it('uses module.modules when module.name is absent', async () => {
    const { input } = createFixture({
      fileHashes: {
        '/repo/packages/ui/src/Button.stories.tsx': 'S',
        '/repo/packages/ui/src/Button.tsx': 'B',
      },
    });
    const stats: Stats = {
      modules: [
        {
          id: 1,
          name: null as unknown as string,
          modules: [
            { name: '/repo/packages/ui/src/Button.stories.tsx' },
            { name: '/repo/packages/ui/src/Button.tsx' },
          ],
          reasons: [{ moduleName: './storybook-stories.js' }],
        },
      ],
    };

    const graph = await readStatsGraph(stats, input);

    expect([...graph.storyFiles]).toEqual(['./src/Button.stories.tsx']);
    expect([...(graph.files.get('./src/Button.stories.tsx')?.dependencies ?? [])]).toContain(
      './src/Button.tsx'
    );
  });
});

describe('readStatsGraph unhashable files', () => {
  it('leaves a file missing on disk out of the hashes and gives its node an empty hash', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const missing = '/repo/packages/ui/src/missing.ts';

    const { input } = createFixture({
      isAbsent: (candidate) => candidate === missing,
      // The missing file has a content hash on the fixture disk, so this pins that absence wins
      // over the bytes: a name with no file contributes nothing, whatever it would have hashed to.
      fileHashes: { [story]: 'S', [missing]: 'WOULD-BE-A' },
    });
    const graph = await readStatsGraph(
      {
        modules: [
          { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: missing, reasons: [{ moduleName: story }] },
        ],
      },
      input
    );

    expect(graph.hashes.has('./src/missing.ts')).toBe(false);
    expect(graph.files.get('./src/missing.ts')?.hash).toBe('');
  });
});

describe('readStatsGraph hashing failures', () => {
  it('treats a file omitted from the hash result as not real', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const { input } = createFixture();

    const graph = await readStatsGraph(
      { modules: [{ id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] }] },
      {
        ...input,
        projectFiles: {
          ...input.projectFiles,
          hashAll: async () => ({}),
        },
      }
    );

    expect(graph.hashes.has('./src/Button.stories.tsx')).toBe(false);
    expect(graph.files.get('./src/Button.stories.tsx')?.hash).toBe('');
    expect([...graph.storyFiles]).toEqual([]);
  });

  it('fails the read rather than returning a graph missing a file it could not read', async () => {
    // Unreadability is a bug, not an answer: a manifest built without those bytes would silently
    // under-capture, so this propagates to the entry point and bails TurboSnap to v1.
    const { input } = createFixture();
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const unreadable = new Error(`Could not hash ${story}: EACCES: permission denied`);

    let err: Error | undefined;
    try {
      await readStatsGraph(
        { modules: [{ id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] }] },
        {
          ...input,
          projectFiles: {
            ...input.projectFiles,
            hashAll: () => Promise.reject(unreadable),
          },
        }
      );
    } catch (error) {
      err = error as Error;
    }

    expect(err?.message).toContain(story);
  });
});
