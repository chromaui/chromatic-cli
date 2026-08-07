import { beforeEach, describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import { disk, resetDisk, statsContext, withAbsent } from './__fixtures__/manifestFixtures';
import { countNodeModulesFiles, readStatsGraph } from './statsGraph';

beforeEach(resetDisk);

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
    disk.current.fileHashes = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B',
    };
    const graph = await readStatsGraph(concatenatedStory, statsContext);

    expect([...graph.storyFiles]).toEqual(['./src/Button.stories.tsx']);
  });

  it('records each concatenated sub-file as a dependency of the root file, hashed by its own bytes', async () => {
    disk.current.fileHashes = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B',
    };
    const graph = await readStatsGraph(concatenatedStory, statsContext);

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
    await withAbsent(
      (candidate) => candidate.includes('*.js'),
      async () => {
        disk.current.fileHashes = {
          '/repo/packages/ui/node_modules/storybook/dist/csf/index.js': 'C',
          '/repo/packages/ui/node_modules/storybook/dist/instrumenter/index.js': 'I',
        };

        const graph = await readStatsGraph(contextsInModules, statsContext);

        // The record keys by its own name, so it stays a real file rather than becoming a story
        // importer, and the module it imports is not a story file.
        expect(graph.files.has('./node_modules/storybook/dist/csf/index.js')).toBe(true);
        expect([...graph.storyFiles]).toEqual([]);
      }
    );
  });
});

describe('readStatsGraph unhashable paths', () => {
  it('skips a module named after a directory rather than failing the read', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    // rspack names one record after a directory on `storybook-builder-rsbuild` 3.3.0/3.3.1. Reading
    // it throws EISDIR, which would fail the whole manifest to an internalError bail.
    const directory = '/repo/packages/ui/node_modules/@storybook/react/dist/';

    disk.current.fileHashes = { [story]: 'S' };
    const graph = await readStatsGraph(
      {
        modules: [
          { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: story, modules: [{ name: directory }], reasons: [] },
        ],
      },
      statsContext
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
    disk.current.fileHashes = { [story]: 'S' };

    const plain = await readStatsGraph(stats('./storybook-stories.js'), statsContext);
    const concatenated = await readStatsGraph(
      stats('./storybook-stories.js + 1 modules'),
      statsContext
    );

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
    disk.current.fileHashes = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B',
    };
    const graph = await readStatsGraph(rspackConcatenatedStory, statsContext);

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
    disk.current.fileHashes = { [story]: 'S', [implementation]: 'B' };

    const full = await readStatsGraph(rspackConcatenatedStory, statsContext);
    const shimmed = await readStatsGraph(shimmedStats, statsContext);

    expect(shimmed).toEqual(full);
  });
});

describe('readStatsGraph missing names', () => {
  it('skips reasons with a null moduleName without dropping the story', async () => {
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
    disk.current.fileHashes = { '/repo/packages/ui/src/Button.stories.tsx': 'S' };

    const graph = await readStatsGraph(stats, statsContext);

    expect([...graph.storyFiles]).toEqual(['./src/Button.stories.tsx']);
  });

  it('uses module.modules when module.name is absent', async () => {
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
    disk.current.fileHashes = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B',
    };

    const graph = await readStatsGraph(stats, statsContext);

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

    await withAbsent(
      (candidate) => candidate === missing,
      async () => {
        // The missing file has a content hash on the fixture disk, so this pins that absence wins
        // over the bytes: a name with no file contributes nothing, whatever it would have hashed to.
        disk.current.fileHashes = { [story]: 'S', [missing]: 'WOULD-BE-A' };
        const graph = await readStatsGraph(
          {
            modules: [
              { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
              { id: 2, name: missing, reasons: [{ moduleName: story }] },
            ],
          },
          statsContext
        );

        expect(graph.hashes.has('./src/missing.ts')).toBe(false);
        expect(graph.files.get('./src/missing.ts')?.hash).toBe('');
      }
    );
  });
});

describe('readStatsGraph hashing failures', () => {
  it('fails the read rather than returning a graph missing a file it could not read', async () => {
    // Unreadability is a bug, not an answer: a manifest built without those bytes would silently
    // under-capture, so this propagates to the entry point and bails TurboSnap to v1.
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const unreadable = new Error(`Could not hash ${story}: EACCES: permission denied`);

    let err: Error | undefined;
    try {
      await readStatsGraph(
        { modules: [{ id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] }] },
        {
          ...statsContext,
          projectFiles: {
            ...statsContext.projectFiles,
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

describe('countNodeModulesFiles', () => {
  it('counts zero for a first-party-only graph', () => {
    const stats: Stats = {
      modules: [
        { id: 1, name: './src/Button.stories.tsx' },
        { id: 2, name: './src/Button.tsx' },
        { id: 3, name: './.storybook/preview.ts' },
      ],
    };

    expect(countNodeModulesFiles(stats)).toBe(0);
  });

  it('counts installed dependency files however the builder spells them', () => {
    const stats: Stats = {
      // One relative (Vite), one absolute (webpack), one via `nameForCondition` (rspack).
      modules: [
        { id: 1, name: './src/Button.tsx' },
        { id: 2, name: './../../node_modules/@storybook/react/dist/entry-preview.js' },
        { id: 3, name: '/repo/node_modules/storybook/dist/csf/index.js' },
        { id: 4, name: 'dependency group', nameForCondition: '/repo/node_modules/react/index.js' },
      ],
    };

    expect(countNodeModulesFiles(stats)).toBe(3);
  });

  it('counts the concatenated children of a dependency group', () => {
    const stats: Stats = {
      modules: [
        {
          id: 1,
          name: './../../node_modules/storybook/dist/csf/index.js + 1 modules',
          modules: [
            { name: './../../node_modules/storybook/dist/csf/index.js' },
            { name: './../../node_modules/storybook/dist/csf/toId.js' },
          ],
        },
      ],
    };

    expect(countNodeModulesFiles(stats)).toBe(2);
  });
});
