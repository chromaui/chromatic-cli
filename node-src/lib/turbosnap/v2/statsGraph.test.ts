/* eslint-disable max-lines */
import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import { createFixture, syntheticAbsent } from './__fixtures__/manifestFixtures';
import { SKIPPED_HASH } from './graph';
import { SkipRule } from './skippedFiles';
import { countNodeModulesFiles, readStatsGraph } from './statsGraph';

// These suites are about builder spellings: what webpack, rspack and Vite each call the same file,
// and what the graph reader makes of it. They assert on the graph, not on a hash — that the right
// edge exists and the right bytes were hashed. Whether an edge reaches a roll-up is graph.test.ts's
// job, and end-to-end in manifest.hashing.test.ts.

// The skip rule is tested on its own, so the reader is handed one that skips nothing unless a test
// says otherwise.
const skipNothing: SkipRule = () => undefined;

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
    const graph = await readStatsGraph(concatenatedStory, input, skipNothing);

    expect([...graph.storyFiles]).toEqual(['./src/Button.stories.tsx']);
  });

  it('records each concatenated sub-file as a dependency of the root file, hashed by its own bytes', async () => {
    const { input } = createFixture({
      fileHashes: {
        '/repo/packages/ui/src/Button.stories.tsx': 'S',
        '/repo/packages/ui/src/Button.tsx': 'B',
      },
    });
    const graph = await readStatsGraph(concatenatedStory, input, skipNothing);

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

    const graph = await readStatsGraph(contextsInModules, input, skipNothing);

    // The record keys by its own name, so it stays a real file rather than becoming a story
    // importer, and the module it imports is not a story file.
    expect(graph.files.has('./node_modules/storybook/dist/csf/index.js')).toBe(true);
    expect([...graph.storyFiles]).toEqual([]);
  });
});

describe('readStatsGraph unhashable paths', () => {
  it('skips an inline data URL rather than treating it as a file path', async () => {
    const dataUrl = `data:font/ttf;base64,AAAAAAAAAAAAAAAAAA`;
    const { input } = createFixture();

    const graph = await readStatsGraph(
      { modules: [{ id: 1, name: dataUrl, reasons: [] }] },
      {
        ...input,
        projectFiles: {
          ...input.projectFiles,
          isFile: (absolutePath) => {
            if (absolutePath.includes(dataUrl)) {
              throw new Error('ENAMETOOLONG: name too long');
            }
            return input.projectFiles.isFile(absolutePath);
          },
        },
      },
      skipNothing
    );

    expect(graph.hashes.size).toBe(0);
    expect(
      graph.files.has(dataUrl),
      'expected dataUrl to be in the list of files found in the graph'
    ).toBe(true);
  });

  it('asks the disk about a NUL-escaped filename by its real name', async () => {
    // Webpack escapes a literal `#` in a filename as `\0#`, so we need to unescape it to get the
    // real path on disk.
    const escaped = '/repo/packages/ui/node_modules/es5-ext/array/\0#/e-index-of.js';
    const onDisk = '/repo/packages/ui/node_modules/es5-ext/array/#/e-index-of.js';

    const { input } = createFixture({ fileHashes: { [onDisk]: 'E' } });
    const graph = await readStatsGraph(
      { modules: [{ id: 1, name: escaped, reasons: [] }] },
      {
        ...input,
        projectFiles: {
          ...input.projectFiles,
          isFile: (absolutePath) => {
            if (absolutePath.includes('\0')) {
              throw new TypeError("The argument 'path' must be a string without null bytes (\0)");
            }
            return input.projectFiles.isFile(absolutePath);
          },
        },
      },
      skipNothing
    );

    expect(graph.hashes.get('./node_modules/es5-ext/array/#/e-index-of.js')).toBe('E');
    expect(graph.files.has('./node_modules/es5-ext/array/#/e-index-of.js')).toBe(true);
  });

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
      input,
      skipNothing
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

    const plain = await readStatsGraph(stats('./storybook-stories.js'), input, skipNothing);
    const concatenated = await readStatsGraph(
      stats('./storybook-stories.js + 1 modules'),
      input,
      skipNothing
    );

    expect(concatenated).toEqual(plain);
  });
});

describe('readStatsGraph reasons carrying a resolvedModule', () => {
  // Webpack/rspack blame every member import on the merged group: `moduleName` spells the group
  // (e.g. `./x + 2 modules`) while `resolvedModule` names the member that contains the import. The
  // edge must land on that member, so an untraced member walls off its own imports.
  const configEntry = './storybook-config-entry.js';
  const preview = '/repo/packages/ui/.storybook/preview.js';
  const hello = '/repo/packages/ui/src/hello.js';

  it('records the edge from the resolved member, none from the root, and dedupes duplicates', async () => {
    const singleReason: Stats = {
      modules: [
        {
          id: 1,
          name: hello,
          reasons: [{ moduleName: `${configEntry} + 2 modules`, resolvedModule: preview }],
        },
      ],
    };
    const duplicateReasons: Stats = {
      modules: [
        {
          id: 1,
          name: hello,
          reasons: [
            { moduleName: `${configEntry} + 2 modules`, resolvedModule: preview },
            { moduleName: preview, resolvedModule: preview },
          ],
        },
      ],
    };
    const { input } = createFixture({ fileHashes: { [preview]: 'P', [hello]: 'H' } });

    const graph = await readStatsGraph(singleReason, input, skipNothing);
    const deduped = await readStatsGraph(duplicateReasons, input, skipNothing);

    expect([...(graph.files.get('./.storybook/preview.js')?.dependencies ?? [])]).toEqual([
      './src/hello.js',
    ]);
    expect(graph.files.has(configEntry)).toBe(false);
    expect([...(deduped.files.get('./.storybook/preview.js')?.dependencies ?? [])]).toEqual([
      './src/hello.js',
    ]);
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
    const graph = await readStatsGraph(rspackConcatenatedStory, input, skipNothing);

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

    const full = await readStatsGraph(rspackConcatenatedStory, input, skipNothing);
    const shimmed = await readStatsGraph(shimmedStats, input, skipNothing);

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

    const graph = await readStatsGraph(stats, input, skipNothing);

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

    const graph = await readStatsGraph(stats, input, skipNothing);

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
      input,
      skipNothing
    );

    expect(graph.hashes.has('./src/missing.ts')).toBe(false);
    expect(graph.files.get('./src/missing.ts')?.hash).toBe('');
  });
});

describe('readStatsGraph hashing failures', () => {
  it('fails the read rather than returning a graph missing a file it could not read', async () => {
    // Unreadability is a bug, not an answer: a manifest built without those bytes would silently
    // under-capture, so this propagates to the entry point and bails TurboSnap to v1.
    const { input } = createFixture();
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const unreadable = new Error(`Could not hash ${story}: EACCES: permission denied`);

    await expect(
      readStatsGraph(
        { modules: [{ id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] }] },
        {
          ...input,
          projectFiles: { ...input.projectFiles, hashAll: () => Promise.reject(unreadable) },
        },
        skipNothing
      )
    ).rejects.toThrow(story);
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

  it('does not count file names and context expressions that only mention node_modules', () => {
    const stats: Stats = {
      modules: [
        { id: 1, name: './src/node_modules-helper.ts' },
        {
          id: 2,
          name: String.raw`./src|lazy|/^\.\/.*$/|include: /(?!.*node_modules)/|namespace object`,
        },
      ],
    };

    expect(countNodeModulesFiles(stats)).toBe(0);
  });

  it('counts installed dependency files however the builder spells them', () => {
    const stats: Stats = {
      // One relative (Vite), two absolute (webpack on POSIX and Windows), one via
      // `nameForCondition` (rspack).
      modules: [
        { id: 1, name: './src/Button.tsx' },
        { id: 2, name: './../../node_modules/@storybook/react/dist/entry-preview.js' },
        { id: 3, name: '/repo/node_modules/storybook/dist/csf/index.js' },
        { id: 4, name: 'dependency group', nameForCondition: '/repo/node_modules/react/index.js' },
        { id: 5, name: String.raw`C:\repo\node_modules\react-dom\index.js` },
      ],
    };

    expect(countNodeModulesFiles(stats)).toBe(4);
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

describe('readStatsGraph global composition roots', () => {
  // Builders use different names for the generated modules that load preview annotations. These
  // cases verify that each supported name resolves to the canonical path stored in the graph.
  const annotation = '/repo/packages/ui/node_modules/@storybook/react/dist/entry-preview.js';

  function statsImportedFrom(rootSpelling: string): Stats {
    return { modules: [{ id: 1, name: annotation, reasons: [{ moduleName: rootSpelling }] }] };
  }

  it.each([
    // Webpack, plus Rsbuild's version without the leading `./`.
    ['./storybook-config-entry.js', './storybook-config-entry.js'],
    ['storybook-config-entry.js', './storybook-config-entry.js'],
    // Rspack and Rsbuild cache the generated entry under `node_modules`.
    [
      './node_modules/.cache/storybook-rsbuild-builder/storybook-config-entry.js',
      './node_modules/.cache/storybook-rsbuild-builder/storybook-config-entry.js',
    ],
    [
      './node_modules/.cache/storybook/storybook-rsbuild-builder/storybook-config-entry.js',
      './node_modules/.cache/storybook/storybook-rsbuild-builder/storybook-config-entry.js',
    ],
    // Vite's app module, plus the annotations module used by Storybook 10. Stats may report either
    // the raw virtual ID or its resolved form.
    [
      '/virtual:/@storybook/builder-vite/vite-app.js',
      '/virtual:/@storybook/builder-vite/vite-app.js',
    ],
    ['virtual:@storybook/builder-vite/vite-app.js', 'virtual:@storybook/builder-vite/vite-app.js'],
    [
      '/virtual:/@storybook/builder-vite/project-annotations.js',
      '/virtual:/@storybook/builder-vite/project-annotations.js',
    ],
    [
      'virtual:@storybook/builder-vite/project-annotations.js',
      'virtual:@storybook/builder-vite/project-annotations.js',
    ],
  ])('recognizes %s as a global composition root', async (spelling, canonical) => {
    const { input } = createFixture({ fileHashes: { [annotation]: 'EP' } });

    const graph = await readStatsGraph(statsImportedFrom(spelling), input, skipNothing);

    expect([...graph.globalRoots]).toEqual([canonical]);
  });

  it('finds the same root when stats paths are anchored outside the project root', async () => {
    // In this monorepo fixture, relative stats paths start at `/repo` while the Storybook project is
    // under `/repo/packages/ui`. The root must therefore be stored with a `../../` prefix.
    const { input } = createFixture({ fileHashes: { [annotation]: 'EP' } });

    const graph = await readStatsGraph(
      statsImportedFrom('./storybook-config-entry.js'),
      {
        ...input,
        statsRoot: '/repo',
      },
      skipNothing
    );

    expect([...graph.globalRoots]).toEqual(['../../storybook-config-entry.js']);
  });

  it('reports no root when the graph contains none', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const { input } = createFixture({ fileHashes: { [story]: 'S' } });

    const graph = await readStatsGraph(
      { modules: [{ id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] }] },
      input,
      skipNothing
    );

    // The stories entry loads story modules, not global annotations, so it is not a global root.
    expect([...graph.globalRoots]).toEqual([]);
  });
});

describe('readStatsGraph skipped files', () => {
  const story = '/repo/packages/ui/src/Button.stories.tsx';
  const generated = '/repo/packages/ui/src/generated/schema.ts';
  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: generated, reasons: [{ moduleName: story }] },
    ],
  };

  // The story reaches the given file only through the generated file, as through a barrel.
  function throughBarrel(behind: string): Stats {
    return {
      modules: [...stats.modules, { id: 3, name: behind, reasons: [{ moduleName: generated }] }],
    };
  }

  it('keeps a skipped file in the graph as a node with the skipped hash, and records it', async () => {
    const { input } = createFixture({ fileHashes: { [story]: 'S', [generated]: 'G' } });

    const graph = await readStatsGraph(stats, input, (candidate) =>
      candidate === generated ? 'gitignored' : undefined
    );

    expect(graph.hashes.get('./src/generated/schema.ts')).toBe(SKIPPED_HASH);
    expect(graph.files.get('./src/generated/schema.ts')?.hash).toBe(SKIPPED_HASH);
    expect([...(graph.files.get('./src/Button.stories.tsx')?.dependencies ?? [])]).toEqual([
      './src/generated/schema.ts',
    ]);
    expect([...graph.skippedFiles]).toEqual([['./src/generated/schema.ts', 'gitignored']]);
  });

  it('severs the edges of an untraced file and reports what they led to, since v1 stops its trace there', async () => {
    const button = '/repo/packages/ui/src/Button.tsx';
    const { input } = createFixture({
      fileHashes: { [story]: 'S', [generated]: 'G', [button]: 'B' },
    });

    const graph = await readStatsGraph(throughBarrel(button), input, (candidate) =>
      candidate === generated ? 'untraced' : undefined
    );

    expect([...(graph.files.get('./src/Button.stories.tsx')?.dependencies ?? [])]).toEqual([
      './src/generated/schema.ts',
    ]);
    expect([...(graph.files.get('./src/generated/schema.ts')?.dependencies ?? [])]).toEqual([]);
    expect(graph.hashes.get('./src/Button.tsx')).toBe('B');
    expect([...graph.untracedSubtrees].sort()).toEqual([
      './src/Button.tsx',
      './src/generated/schema.ts',
    ]);
  });

  it('keeps the edges of a gitignored file, so a tracked file behind a generated barrel still reaches the story', async () => {
    const button = '/repo/packages/ui/src/Button.tsx';
    const { input } = createFixture({
      fileHashes: { [story]: 'S', [generated]: 'G', [button]: 'B' },
    });

    const graph = await readStatsGraph(throughBarrel(button), input, (candidate) =>
      candidate === generated ? 'gitignored' : undefined
    );

    expect([...(graph.files.get('./src/generated/schema.ts')?.dependencies ?? [])]).toEqual([
      './src/Button.tsx',
    ]);
    expect([...graph.untracedSubtrees]).toEqual([]);
  });

  it('still detects a skipped story file as a story file', async () => {
    const { input } = createFixture({ fileHashes: { [story]: 'S', [generated]: 'G' } });

    const graph = await readStatsGraph(stats, input, (candidate) =>
      candidate === story ? 'untraced' : undefined
    );

    expect([...graph.storyFiles]).toEqual(['./src/Button.stories.tsx']);
    expect(graph.hashes.get('./src/Button.stories.tsx')).toBe(SKIPPED_HASH);
  });

  it('never asks the rule about a path with no file on disk', async () => {
    const asked: string[] = [];
    const { input } = createFixture({
      isAbsent: (candidate) => candidate === generated || syntheticAbsent(candidate),
    });

    await readStatsGraph(stats, input, (candidate) => {
      asked.push(candidate);
      return undefined;
    });

    expect(asked).toEqual([story]);
  });
});
