import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Stats } from '../../../types';
import {
  outOfGraph,
  projectRoot,
  withGlobAbsent,
  withSyntheticAbsent,
} from './__fixtures__/manifestFixtures';
import { buildManifest, serializeManifest } from './manifest';

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  // A trailing slash names a directory: present on disk, but not a regular file.
  statSync: (candidate: unknown) => ({ isFile: () => !String(candidate).endsWith('/') }),
  writeFileSync: vi.fn(),
}));

// Hoisted refs the mock factories read, so each test controls the file hashes and the swept
// directory tree; see ./__fixtures__/manifestMocks.
const { fileHashesRef, directoryTreeRef } = vi.hoisted(() => ({
  fileHashesRef: { current: {} as Record<string, string> },
  directoryTreeRef: { current: {} as Record<string, string[]> },
}));

vi.mock('../../getFileHashes', async () => {
  const { fileHashesModule } = await import('./__fixtures__/manifestMocks');
  return fileHashesModule(fileHashesRef);
});

vi.mock('fs/promises', async (importOriginal) => {
  const { directoryTreeModule } = await import('./__fixtures__/manifestMocks');
  return {
    ...(await importOriginal<typeof import('fs/promises')>()),
    ...directoryTreeModule(directoryTreeRef),
  };
});

// The version is read off the resolved Storybook package on disk, which no fixture here installs;
// stub it so these tests exercise graph hashing only. See storybookVersion.test.ts for the probe.
vi.mock('./storybookVersion', () => ({
  resolveStorybookVersion: () => '9.1.20',
}));

beforeEach(() => {
  fileHashesRef.current = {};
  directoryTreeRef.current = {};
});

describe('buildManifest story detection through a require-context', () => {
  // Webpack/rspack don't import story files directly from the entry: the entry imports a lazy
  // require-context (a glob module that is not a real file), and that context imports the stories.
  const glob = './src/lib/ lazy namespace object';
  const story = '/repo/packages/ui/src/lib/Button.stories.tsx';

  const stats: Stats = {
    modules: [
      { id: 1, name: glob, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: story, reasons: [{ moduleName: glob }] },
    ],
  };

  it('detects stories imported via a lazy require-context imported by the entry', async () => {
    await withGlobAbsent(async () => {
      fileHashesRef.current = { [story]: 'S' };
      const manifest = await buildManifest(stats, projectRoot, outOfGraph);
      expect([...manifest.storyFileHashes.keys()]).toEqual(['./src/lib/Button.stories.tsx']);
    });
  });

  it('excludes the require-context glob (no file on disk) from the files map', async () => {
    await withGlobAbsent(async () => {
      fileHashesRef.current = { [story]: 'S' };
      const manifest = await buildManifest(stats, projectRoot, outOfGraph);
      expect([...manifest.files.keys()].some((key) => key.includes('lazy'))).toBe(false);
      expect(manifest.files.has('./src/lib/Button.stories.tsx')).toBe(true);
    });
  });

  it('does not treat the require-context glob itself as a story file', async () => {
    await withGlobAbsent(async () => {
      fileHashesRef.current = { [story]: 'S' };
      const manifest = await buildManifest(stats, projectRoot, outOfGraph);
      const keys = [...manifest.storyFileHashes.keys()];
      expect(keys.some((key) => key.includes('lazy'))).toBe(false);
    });
  });

  it('reports the relocated entry above a lazy story context when it is absent from the catalogue', async () => {
    const relocatedEntry = './node_modules/.cache/storybook-next/storybook-stories.js';
    const relocatedStats: Stats = {
      modules: [
        { id: 1, name: glob, reasons: [{ moduleName: relocatedEntry }] },
        { id: 2, name: story, reasons: [{ moduleName: glob }] },
      ],
    };

    await withGlobAbsent(async () => {
      fileHashesRef.current = { [story]: 'S' };
      const manifest = await buildManifest(relocatedStats, projectRoot, outOfGraph);

      expect(manifest.storyFileHashes.size).toBe(0);
      expect(manifest.unrecognizedStoryEntries).toEqual([relocatedEntry]);
    });
  });

  it('does not report an application file that owns an unrelated lazy context', async () => {
    const applicationImporter = '/repo/packages/ui/src/loadExamples.ts';
    const importedFile = '/repo/packages/ui/src/examples/Button.tsx';
    const applicationStats: Stats = {
      modules: [
        { id: 1, name: applicationImporter },
        { id: 2, name: glob, reasons: [{ moduleName: applicationImporter }] },
        { id: 3, name: importedFile, reasons: [{ moduleName: glob }] },
      ],
    };

    await withGlobAbsent(async () => {
      fileHashesRef.current = { [applicationImporter]: 'I', [importedFile]: 'B' };
      const manifest = await buildManifest(applicationStats, projectRoot, outOfGraph);

      expect(manifest.unrecognizedStoryEntries).toEqual([]);
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
      fileHashesRef.current = { [story]: 'S' };

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

describe('buildManifest story detection through a config-entry require-context', () => {
  // rsbuild imports the require-context from the config entry (not storybook-stories.js), and the
  // stories themselves are concatenated modules.
  const glob = './src/lib|lazy|namespace object';
  const configEntry = './node_modules/.cache/storybook-rsbuild-builder/storybook-config-entry.js';
  const story = '/repo/packages/ui/src/lib/Button.stories.tsx';
  const impl = '/repo/packages/ui/src/lib/Button.tsx';

  const stats: Stats = {
    modules: [
      { id: 1, name: glob, reasons: [{ moduleName: `${configEntry} + 1 modules` }] },
      {
        id: 2,
        name: `${story} + 1 modules`,
        modules: [{ name: story }, { name: impl }],
        reasons: [{ moduleName: glob }],
      },
      // A real file the config entry imports directly (like `.storybook/preview.ts`); it must not
      // be mistaken for a story just because the config entry imports it.
      {
        id: 3,
        name: '/repo/packages/ui/.storybook/preview.ts',
        reasons: [{ moduleName: `${configEntry} + 1 modules` }],
      },
    ],
  };

  it('detects a concatenated story imported via a context imported by the config entry', async () => {
    await withGlobAbsent(async () => {
      fileHashesRef.current = { [story]: 'S', [impl]: 'B' };
      const manifest = await buildManifest(stats, projectRoot, outOfGraph);
      expect([...manifest.storyFileHashes.keys()]).toEqual(['./src/lib/Button.stories.tsx']);
    });
  });

  it('does not treat a real file imported directly by the config entry as a story', async () => {
    await withGlobAbsent(async () => {
      fileHashesRef.current = { [story]: 'S', [impl]: 'B' };
      const manifest = await buildManifest(stats, projectRoot, outOfGraph);
      expect([...manifest.storyFileHashes.keys()]).not.toContain('.storybook/preview.ts');
    });
  });
});

describe('buildManifest story detection when the builder omits the `./` prefix', () => {
  // storybook-builder-rsbuild 3.x ships `withChromaticMinimalContract`, which re-derives module names
  // via `path.relative(cwd, …)` — that never emits a `./` prefix. So the same graph carries both
  // spellings: the config entry is named `./storybook-config-entry.js` but referenced as
  // `storybook-config-entry.js`, and the require-context is named bare. Comparing the entry allowlist
  // against the raw spelling matched nothing and every build bailed `noStoryFiles`.
  const configEntry = 'storybook-config-entry.js';
  const glob = String.raw`src/lib|lazy|/^\.\/.*$/|namespace object`;
  const story = '/repo/packages/ui/src/lib/Button.stories.tsx';
  const impl = '/repo/packages/ui/src/lib/Button.tsx';

  const stats: Stats = {
    modules: [
      { id: 1, name: glob, reasons: [{ moduleName: configEntry }] },
      { id: 2, name: story, reasons: [{ moduleName: glob }] },
      { id: 3, name: impl, reasons: [{ moduleName: story }] },
      // Storybook's preview runtime globals. The config entry imports them and they have no file on
      // disk, which is exactly the shape of a require-context — but an external imports nothing, so
      // it must never become a story importer.
      {
        id: 4,
        name: 'external "__STORYBOOK_MODULE_PREVIEW_API__"',
        reasons: [{ moduleName: configEntry }],
      },
    ],
  };

  it('detects the story behind a bare-named context imported by a bare-named entry', async () => {
    await withSyntheticAbsent(async () => {
      fileHashesRef.current = { [story]: 'S', [impl]: 'B' };
      const manifest = await buildManifest(stats, projectRoot, outOfGraph);
      expect([...manifest.storyFileHashes.keys()]).toEqual(['./src/lib/Button.stories.tsx']);
    });
  });

  it('rolls the story implementation into the story hash', async () => {
    await withSyntheticAbsent(async () => {
      fileHashesRef.current = { [story]: 'S', [impl]: 'B' };
      const before = await buildManifest(stats, projectRoot, outOfGraph);
      fileHashesRef.current = { [story]: 'S', [impl]: 'B2' };
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
      fileHashesRef.current = { ...hashes };

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
      fileHashesRef.current = { [throughGlob]: 'W' };
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
      fileHashesRef.current = { ...hashes };

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
      fileHashesRef.current = { ...hashes };

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
  const globalsKey = '<storybookGlobals>';
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
      fileHashesRef.current = hashes('H1');
      const before = await buildManifest(stats, projectRoot, outOfGraph);

      expect([...before.attribution.storybookGlobals].sort()).toEqual([
        './src/probe/hiddenInner.tsx',
        './src/probe/orphanRoot.tsx',
      ]);

      fileHashesRef.current = hashes('H2');
      const after = await buildManifest(stats, projectRoot, outOfGraph);

      // Editing the inner file used to leave the manifest byte-identical.
      expect(after.storybookFiles.get(globalsKey)).not.toBe(before.storybookFiles.get(globalsKey));
      expect(after.storybookHash).not.toBe(before.storybookHash);
    });
  });

  it('lands every hashed file in exactly one attribution home', async () => {
    await withSyntheticAbsent(async () => {
      fileHashesRef.current = hashes('H1');
      const { attribution } = await buildManifest(stats, projectRoot, outOfGraph);

      // The story and preview subtrees are disjoint in this graph, so each file has one home only.
      const homes = Object.entries(attribution);
      for (const hashedFile of Object.keys(fileHashesRef.current)) {
        const filePath = hashedFile.replace(projectRoot, '.');
        expect(homes.filter(([, files]) => files.has(filePath)).map(([home]) => home)).toHaveLength(
          1
        );
      }
    });
  });

  it('leaves no dependency reference outside the serialized graph', async () => {
    await withSyntheticAbsent(async () => {
      fileHashesRef.current = hashes('H1');
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

describe('buildManifest story detection of swept node_modules stories', () => {
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

  it('does not treat a swept node_modules story as a story file', async () => {
    await withGlobAbsent(async () => {
      fileHashesRef.current = { [story]: 'S', [swept]: 'W', [shared]: 'R' };
      const manifest = await buildManifest(stats, projectRoot, outOfGraph);
      expect([...manifest.storyFileHashes.keys()]).toEqual(['./src/lib/Button.stories.tsx']);
    });
  });

  it('leaves the swept story subtree in the globals catch-all rather than draining it', async () => {
    await withGlobAbsent(async () => {
      fileHashesRef.current = { [story]: 'S', [swept]: 'W', [shared]: 'R' };
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
      fileHashesRef.current = { [story]: 'S', [swept]: 'W', [shared]: 'R' };
      const before = await buildManifest(stats, projectRoot, outOfGraph);
      fileHashesRef.current = { [story]: 'S', [swept]: 'W', [shared]: 'R2' };
      const after = await buildManifest(stats, projectRoot, outOfGraph);

      expect(after.storybookFiles.get('<storybookGlobals>')).not.toBe(
        before.storybookFiles.get('<storybookGlobals>')
      );
    });
  });

  it('keeps a node_modules story a deliberate node_modules glob asked for', async () => {
    // A glob naming `node_modules` (e.g. `../node_modules/@myorg/ui/**/*.stories.js`) is indexed by
    // core — `commonGlobOptions` applies no ignore — and the builder emits the include regex raw,
    // with no lookahead. The context is rooted in `node_modules`, so the sweep is intentional and
    // the story key is real and matchable.
    const deliberateGlob = String.raw`./node_modules/@myorg/ui|lazy|/^\.\/.*$/|namespace object`;
    const shipped = '/repo/packages/ui/node_modules/@myorg/ui/Button.stories.js';
    await withGlobAbsent(async () => {
      fileHashesRef.current = { [shipped]: 'D' };
      const manifest = await buildManifest(
        {
          modules: [
            { id: 1, name: deliberateGlob, reasons: [{ moduleName: './storybook-stories.js' }] },
            { id: 2, name: shipped, reasons: [{ moduleName: deliberateGlob }] },
          ],
        },
        projectRoot,
        outOfGraph
      );
      expect([...manifest.storyFileHashes.keys()]).toEqual([
        './node_modules/@myorg/ui/Button.stories.js',
      ]);
    });
  });

  it('keeps a node_modules story imported directly by the stories entry', async () => {
    // Vite has no require-context: `storybook-stories.js` imports the matched files directly, and
    // that list comes from the same glob resolution the indexer uses. So a node_modules story there
    // is deliberate by construction and must survive.
    const shipped = '/repo/packages/ui/node_modules/@myorg/ui/Button.stories.js';
    fileHashesRef.current = { [shipped]: 'D' };
    const manifest = await buildManifest(
      { modules: [{ id: 1, name: shipped, reasons: [{ moduleName: './storybook-stories.js' }] }] },
      projectRoot,
      outOfGraph
    );
    expect([...manifest.storyFileHashes.keys()]).toEqual([
      './node_modules/@myorg/ui/Button.stories.js',
    ]);
  });
});
