import { beforeEach, describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import {
  disk,
  outOfGraph,
  projectRoot,
  resetDisk,
  withGlobAbsent,
  withSyntheticAbsent,
} from './__fixtures__/manifestFixtures';
import { buildManifest, serializeManifest } from './manifest';

beforeEach(resetDisk);

describe('buildManifest with a require-context in the graph', () => {
  // Webpack/rspack don't import story files directly from the entry: the entry imports a lazy
  // require-context (a glob module that is not a real file), and that context imports the stories.
  // Which files that makes stories is storyDetection's rule; here it is only the synthetic node.
  const glob = './src/lib/ lazy namespace object';
  const story = '/repo/packages/ui/src/lib/Button.stories.tsx';

  const stats: Stats = {
    modules: [
      { id: 1, name: glob, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: story, reasons: [{ moduleName: glob }] },
    ],
  };

  it('excludes the require-context glob (no file on disk) from the files map', async () => {
    await withGlobAbsent(async () => {
      disk.current.fileHashes = { [story]: 'S' };
      const manifest = await buildManifest(stats, projectRoot, outOfGraph);
      expect([...manifest.files.keys()].some((key) => key.includes('lazy'))).toBe(false);
      expect(manifest.files.has('./src/lib/Button.stories.tsx')).toBe(true);
    });
  });

  it('serializes the same manifest when only the require-context identity gains a concatenation suffix', async () => {
    await withGlobAbsent(async () => {
      const statsWithContext = (storyImporter: string): Stats => ({
        modules: [
          { id: 1, name: storyImporter, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: story, reasons: [{ moduleName: storyImporter }] },
        ],
      });
      disk.current.fileHashes = { [story]: 'S' };

      const plain = serializeManifest(
        await buildManifest(statsWithContext(glob), projectRoot, outOfGraph)
      );
      const concatenated = serializeManifest(
        await buildManifest(statsWithContext(`${glob} + 1 modules`), projectRoot, outOfGraph)
      );

      expect(concatenated).toEqual(plain);
    });
  });
});

describe('buildManifest story hashing behind a bare-named require-context', () => {
  // storybook-builder-rsbuild 3.x ships `withChromaticMinimalContract`, which re-derives module names
  // via `path.relative(cwd, …)` — that never emits a `./` prefix, so the same graph carries both
  // spellings of the config entry and the context. Recognizing them is storyDetection's rule; here it
  // is the roll-up that has to reach through the synthetic node.
  const configEntry = 'storybook-config-entry.js';
  const glob = String.raw`src/lib|lazy|/^\.\/.*$/|namespace object`;
  const story = '/repo/packages/ui/src/lib/Button.stories.tsx';
  const impl = '/repo/packages/ui/src/lib/Button.tsx';

  const stats: Stats = {
    modules: [
      { id: 1, name: glob, reasons: [{ moduleName: configEntry }] },
      { id: 2, name: story, reasons: [{ moduleName: glob }] },
      { id: 3, name: impl, reasons: [{ moduleName: story }] },
    ],
  };

  it('rolls the story implementation into the story hash', async () => {
    await withSyntheticAbsent(async () => {
      disk.current.fileHashes = { [story]: 'S', [impl]: 'B' };
      const before = await buildManifest(stats, projectRoot, outOfGraph);
      disk.current.fileHashes = { [story]: 'S', [impl]: 'B2' };
      const after = await buildManifest(stats, projectRoot, outOfGraph);

      expect(after.storyFileHashes.get('./src/lib/Button.stories.tsx')).not.toBe(
        before.storyFileHashes.get('./src/lib/Button.stories.tsx')
      );
    });
  });
});

describe('buildManifest attribution', () => {
  const story = '/repo/packages/ui/src/Button.stories.tsx';
  const storyDep = '/repo/packages/ui/node_modules/moment/moment.js';
  const preview = '/repo/packages/ui/.storybook/preview.ts';
  const previewHelper = '/repo/packages/ui/.storybook/theme.ts';
  const orphan = '/repo/packages/ui/node_modules/@storybook/react/dist/entry-preview.js';
  const configEntry = './storybook-config-entry.js';

  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: storyDep, reasons: [{ moduleName: story }] },
      { id: 3, name: preview, reasons: [{ moduleName: configEntry }] },
      { id: 4, name: previewHelper, reasons: [{ moduleName: preview }] },
      { id: 5, name: orphan, reasons: [{ moduleName: configEntry }] },
    ],
  };

  const hashes = {
    [story]: 'S',
    [storyDep]: 'M',
    [preview]: 'P',
    [previewHelper]: 'PT',
    [orphan]: 'EP',
  };

  it('records each real file in the set that hashes it', async () => {
    await withSyntheticAbsent(async () => {
      disk.current.fileHashes = { ...hashes };

      const { attribution } = await buildManifest(stats, projectRoot, outOfGraph);

      expect([...attribution.storyReachable].sort()).toEqual([
        './node_modules/moment/moment.js',
        './src/Button.stories.tsx',
      ]);
      expect([...attribution.previewSubtree].sort()).toEqual([
        './.storybook/preview.ts',
        './.storybook/theme.ts',
      ]);
      expect([...attribution.storybookGlobals]).toEqual([
        './node_modules/@storybook/react/dist/entry-preview.js',
      ]);
    });
  });

  it('reports a file reached only through a synthetic node as story-reachable', async () => {
    // The defect this exists to prevent: pruning runs after hashing, so the written graph has a hole
    // where the require-context was. A reachability walk over it calls a correctly-attributed file
    // an orphan — the artifact behind the false "moment is in the bucket" reading.
    const lazyGlob = './src/lib/ lazy namespace object';
    const throughGlob = '/repo/packages/ui/src/lib/Widget.stories.tsx';

    await withSyntheticAbsent(async () => {
      disk.current.fileHashes = { [throughGlob]: 'W' };
      const manifest = await buildManifest(
        {
          modules: [
            { id: 1, name: lazyGlob, reasons: [{ moduleName: './storybook-stories.js' }] },
            { id: 2, name: throughGlob, reasons: [{ moduleName: lazyGlob }] },
          ],
        },
        projectRoot,
        outOfGraph
      );

      expect([...manifest.attribution.storyReachable]).toEqual(['./src/lib/Widget.stories.tsx']);
      expect([...manifest.attribution.storybookGlobals]).toEqual([]);
      // The synthetic node is gone from the written graph, so this attribution is unreconstructable.
      expect([...manifest.files.keys()].some((key) => key.includes('lazy'))).toBe(false);
    });
  });

  it('omits synthetic nodes from every set', async () => {
    await withSyntheticAbsent(async () => {
      disk.current.fileHashes = { ...hashes };

      const { attribution } = await buildManifest(stats, projectRoot, outOfGraph);

      const all = [
        ...attribution.storyReachable,
        ...attribution.previewSubtree,
        ...attribution.storybookGlobals,
      ];
      expect(all.some((filePath) => filePath.includes('storybook-config-entry'))).toBe(false);
      expect(all.some((filePath) => filePath.includes('storybook-stories'))).toBe(false);
    });
  });

  it('serializes each set as a sorted, JSON-safe array', async () => {
    await withSyntheticAbsent(async () => {
      disk.current.fileHashes = { ...hashes };

      const serialized = serializeManifest(await buildManifest(stats, projectRoot, outOfGraph));

      expect(serialized.attribution.previewSubtree).toEqual([
        './.storybook/preview.ts',
        './.storybook/theme.ts',
      ]);
      // eslint-disable-next-line unicorn/prefer-structured-clone
      expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
    });
  });
});

describe('buildManifest attribution closure', () => {
  const story = '/repo/packages/ui/src/lib/Badge/Badge.stories.tsx';
  const storyDep = '/repo/packages/ui/src/lib/Badge/Badge.tsx';
  const preview = '/repo/packages/ui/.storybook/preview.ts';
  const previewHelper = '/repo/packages/ui/.storybook/test.ts';
  const orphanRoot = '/repo/packages/ui/src/probe/orphanRoot.tsx';
  const hiddenInner = '/repo/packages/ui/src/probe/hiddenInner.tsx';
  const globalsKey = 'storybookGlobals';
  const configEntry = './storybook-config-entry.js';

  // A concatenated module whose root is itself an orphan global. The inner file is hashed, but it is
  // only recorded as a dependency of the root and never gets an entry of its own, so attribution
  // closed over `files` could not see it.
  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: storyDep, reasons: [{ moduleName: story }] },
      { id: 3, name: preview, reasons: [{ moduleName: configEntry }] },
      { id: 4, name: previewHelper, reasons: [{ moduleName: preview }] },
      {
        id: 5,
        name: `${orphanRoot} + 1 modules`,
        modules: [{ name: orphanRoot }, { name: hiddenInner }],
        reasons: [{ moduleName: configEntry }],
      },
    ],
  };

  function hashes(innerHash: string) {
    return {
      [story]: 'S',
      [storyDep]: 'B',
      [preview]: 'P',
      [previewHelper]: 'PT',
      [orphanRoot]: 'O',
      [hiddenInner]: innerHash,
    };
  }

  it('attributes a file that is hashed only inside a concatenated module', async () => {
    await withSyntheticAbsent(async () => {
      disk.current.fileHashes = hashes('H1');
      const before = await buildManifest(stats, projectRoot, outOfGraph);

      expect([...before.attribution.storybookGlobals].sort()).toEqual([
        './src/probe/hiddenInner.tsx',
        './src/probe/orphanRoot.tsx',
      ]);

      disk.current.fileHashes = hashes('H2');
      const after = await buildManifest(stats, projectRoot, outOfGraph);

      // Editing the inner file used to leave the manifest byte-identical.
      expect(after.storybookFiles.get(globalsKey)).not.toBe(before.storybookFiles.get(globalsKey));
      expect(after.storybookHash).not.toBe(before.storybookHash);
    });
  });

  it('lands every hashed file in exactly one attribution home', async () => {
    await withSyntheticAbsent(async () => {
      disk.current.fileHashes = hashes('H1');
      const { attribution } = await buildManifest(stats, projectRoot, outOfGraph);

      // The story and preview subtrees are disjoint in this graph, so each file has one home only.
      const homes = Object.entries(attribution);
      for (const hashedFile of Object.keys(disk.current.fileHashes)) {
        const filePath = hashedFile.replace(projectRoot, '.');
        expect(homes.filter(([, files]) => files.has(filePath)).map(([home]) => home)).toHaveLength(
          1
        );
      }
    });
  });

  it('leaves no dependency reference outside the serialized graph', async () => {
    await withSyntheticAbsent(async () => {
      disk.current.fileHashes = hashes('H1');
      const serialized = serializeManifest(await buildManifest(stats, projectRoot, outOfGraph));

      for (const file of Object.values(serialized.files)) {
        expect(file.dependencies.every((dependency) => dependency in serialized.files)).toBe(true);
      }
      expect(serialized.files['./src/probe/orphanRoot.tsx'].dependencies).toEqual([
        './src/probe/hiddenInner.tsx',
      ]);
    });
  });
});

describe('buildManifest attribution of swept node_modules stories', () => {
  // On storybook-builder-rsbuild 1.x–3.3.x, a stories glob whose directory prefix is not
  // slash-bounded lets rspack's require-context sweep a dependency's story into the graph: core
  // prepends `(?!.*node_modules)` but strips the `^`, so the unanchored guard matches after the
  // `node_modules` segment. Storybook's indexer applies `ignore: ["**/node_modules/**"]` to the same
  // glob, so the swept story is absent from `index.json` and its key can never be matched.
  const sweepingGlob = String.raw`..|lazy|/^\.\/.*$/|include: /(?!.*node_modules)…/|namespace object`;
  const story = '/repo/packages/ui/src/lib/Button.stories.tsx';
  const swept = '/repo/packages/ui/node_modules/fake-dep/Widget.stories.tsx';
  const shared = '/repo/packages/ui/node_modules/react-dom/index.js';

  const stats: Stats = {
    modules: [
      { id: 1, name: sweepingGlob, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: story, reasons: [{ moduleName: sweepingGlob }] },
      { id: 3, name: swept, reasons: [{ moduleName: sweepingGlob }] },
      { id: 4, name: shared, reasons: [{ moduleName: swept }] },
    ],
  };

  it('leaves the swept story subtree in the globals catch-all rather than draining it', async () => {
    await withGlobAbsent(async () => {
      disk.current.fileHashes = { [story]: 'S', [swept]: 'W', [shared]: 'R' };
      const manifest = await buildManifest(stats, projectRoot, outOfGraph);
      // The drain: were the swept story a story file, its subtree would be story-reachable and so
      // absent from the catch-all, and a change to the shared runtime would move nothing the Index
      // can match.
      expect([...manifest.attribution.storybookGlobals]).toEqual(
        expect.arrayContaining([
          './node_modules/fake-dep/Widget.stories.tsx',
          './node_modules/react-dom/index.js',
        ])
      );
      expect([...manifest.attribution.storyReachable]).toEqual(['./src/lib/Button.stories.tsx']);
    });
  });

  it('recaptures a change to a shared runtime file the swept story imports', async () => {
    await withGlobAbsent(async () => {
      disk.current.fileHashes = { [story]: 'S', [swept]: 'W', [shared]: 'R' };
      const before = await buildManifest(stats, projectRoot, outOfGraph);
      disk.current.fileHashes = { [story]: 'S', [swept]: 'W', [shared]: 'R2' };
      const after = await buildManifest(stats, projectRoot, outOfGraph);

      expect(after.storybookFiles.get('storybookGlobals')).not.toBe(
        before.storybookFiles.get('storybookGlobals')
      );
    });
  });
});
