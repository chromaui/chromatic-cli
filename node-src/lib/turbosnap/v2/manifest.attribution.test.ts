/* eslint-disable max-lines */
import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import {
  createFixture,
  globAbsent,
  projectRoot,
  syntheticAbsent,
} from './__fixtures__/manifestFixtures';
import { buildManifest, serializeManifest } from './manifest';

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

  it('keeps the require-context glob in memory and excludes it from the serialized files', async () => {
    const { disk, input } = createFixture({ isAbsent: globAbsent });
    disk.fileHashes = { [story]: 'S' };
    const manifest = await buildManifest(stats, input);
    const serialized = serializeManifest(manifest);

    expect([...manifest.files.keys()].some((key) => key.includes('lazy'))).toBe(true);
    expect(manifest.files.has('./src/lib/Button.stories.tsx')).toBe(true);
    expect(Object.keys(serialized.files).some((key) => key.includes('lazy'))).toBe(false);
    expect(serialized.files).toHaveProperty('./src/lib/Button.stories.tsx');
  });

  it('serializes the same manifest when only the require-context identity gains a concatenation suffix', async () => {
    const { disk, input } = createFixture({ isAbsent: globAbsent });
    const statsWithContext = (storyImporter: string): Stats => ({
      modules: [
        { id: 1, name: storyImporter, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: story, reasons: [{ moduleName: storyImporter }] },
      ],
    });
    disk.fileHashes = { [story]: 'S' };

    const plain = serializeManifest(await buildManifest(statsWithContext(glob), input));
    const concatenated = serializeManifest(
      await buildManifest(statsWithContext(`${glob} + 1 modules`), input)
    );

    expect(concatenated).toEqual(plain);
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
    const { disk, input } = createFixture({ isAbsent: syntheticAbsent });
    disk.fileHashes = { [story]: 'S', [impl]: 'B' };
    const before = await buildManifest(stats, input);
    disk.fileHashes = { [story]: 'S', [impl]: 'B2' };
    const after = await buildManifest(stats, input);

    expect(after.storyFileHashes.get('./src/lib/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/lib/Button.stories.tsx')
    );
  });
});

describe('buildManifest attribution', () => {
  const story = '/repo/packages/ui/src/Button.stories.tsx';
  const storyDep = '/repo/packages/ui/node_modules/moment/moment.js';
  const preview = '/repo/packages/ui/.storybook/preview.ts';
  const previewHelper = '/repo/packages/ui/.storybook/theme.ts';
  const entryPreview = '/repo/packages/ui/node_modules/@storybook/react/dist/entry-preview.js';
  const configEntry = './storybook-config-entry.js';

  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: storyDep, reasons: [{ moduleName: story }] },
      { id: 3, name: preview, reasons: [{ moduleName: configEntry }] },
      { id: 4, name: previewHelper, reasons: [{ moduleName: preview }] },
      { id: 5, name: entryPreview, reasons: [{ moduleName: configEntry }] },
    ],
  };

  const hashes = {
    [story]: 'S',
    [storyDep]: 'M',
    [preview]: 'P',
    [previewHelper]: 'PT',
    [entryPreview]: 'EP',
  };

  it('records each real file under the hashing home it landed in', async () => {
    const { disk, input } = createFixture({ isAbsent: syntheticAbsent });
    disk.fileHashes = { ...hashes };

    const { attribution } = await buildManifest(stats, input);

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

  it('reports a file reached only through a synthetic node as story-reachable', async () => {
    // The defect this exists to prevent: pruning runs after hashing, so the written graph has a hole
    // where the require-context was. A reachability walk over it calls a correctly-attributed file
    // unreachable — the artifact behind the false "moment is in globals" reading.
    const lazyGlob = './src/lib/ lazy namespace object';
    const throughGlob = '/repo/packages/ui/src/lib/Widget.stories.tsx';

    const { disk, input } = createFixture({ isAbsent: syntheticAbsent });
    disk.fileHashes = { [throughGlob]: 'W' };
    const manifest = await buildManifest(
      {
        modules: [
          { id: 1, name: lazyGlob, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: throughGlob, reasons: [{ moduleName: lazyGlob }] },
        ],
      },
      input
    );

    expect([...manifest.attribution.storyReachable]).toEqual(['./src/lib/Widget.stories.tsx']);
    expect([...manifest.attribution.storybookGlobals]).toEqual([]);
    // The synthetic node is gone from the written graph, so this attribution is unreconstructable.
    expect(Object.keys(serializeManifest(manifest).files).some((key) => key.includes('lazy'))).toBe(
      false
    );
  });

  it('omits synthetic nodes from every set', async () => {
    const { disk, input } = createFixture({ isAbsent: syntheticAbsent });
    disk.fileHashes = { ...hashes };

    const { attribution } = await buildManifest(stats, input);

    const all = [
      ...attribution.storyReachable,
      ...attribution.previewSubtree,
      ...attribution.storybookGlobals,
    ];
    expect(all.some((filePath) => filePath.includes('storybook-config-entry'))).toBe(false);
    expect(all.some((filePath) => filePath.includes('storybook-stories'))).toBe(false);
  });

  it('serializes each set as a sorted, JSON-safe array', async () => {
    const { disk, input } = createFixture({ isAbsent: syntheticAbsent });
    disk.fileHashes = { ...hashes };

    const serialized = serializeManifest(await buildManifest(stats, input));

    expect(serialized.attribution.previewSubtree).toEqual([
      './.storybook/preview.ts',
      './.storybook/theme.ts',
    ]);
    // eslint-disable-next-line unicorn/prefer-structured-clone
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
  });
});

describe('buildManifest attribution closure', () => {
  const story = '/repo/packages/ui/src/lib/Badge/Badge.stories.tsx';
  const storyDep = '/repo/packages/ui/src/lib/Badge/Badge.tsx';
  const preview = '/repo/packages/ui/.storybook/preview.ts';
  const previewHelper = '/repo/packages/ui/.storybook/test.ts';
  const globalRoot = '/repo/packages/ui/src/probe/globalRoot.tsx';
  const hiddenInner = '/repo/packages/ui/src/probe/hiddenInner.tsx';
  const globalsKey = 'storybookGlobals';
  const configEntry = './storybook-config-entry.js';

  // A concatenated module whose root is itself a Storybook global. The inner file is hashed, but it is
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
        name: `${globalRoot} + 1 modules`,
        modules: [{ name: globalRoot }, { name: hiddenInner }],
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
      [globalRoot]: 'O',
      [hiddenInner]: innerHash,
    };
  }

  it('attributes a file that is hashed only inside a concatenated module', async () => {
    const { disk, input } = createFixture({
      isAbsent: syntheticAbsent,
      fileHashes: hashes('H1'),
    });
    const before = await buildManifest(stats, input);

    expect([...before.attribution.storybookGlobals].sort()).toEqual([
      './src/probe/globalRoot.tsx',
      './src/probe/hiddenInner.tsx',
    ]);

    disk.fileHashes = hashes('H2');
    const after = await buildManifest(stats, input);

    // Editing the inner file used to leave the manifest byte-identical.
    expect(after.storybookConfigHashes.get(globalsKey)).not.toBe(
      before.storybookConfigHashes.get(globalsKey)
    );
    expect(after.storybookHash).not.toBe(before.storybookHash);
  });

  it('lands every hashed file in exactly one attribution home', async () => {
    const { input } = createFixture({ isAbsent: syntheticAbsent, fileHashes: hashes('H1') });
    const { attribution } = await buildManifest(stats, input);

    // The story and preview subtrees are disjoint in this graph, so each file has one home only.
    const homes = Object.entries(attribution);
    for (const hashedFile of Object.keys(hashes('H1'))) {
      const filePath = hashedFile.replace(projectRoot, '.');
      expect(homes.filter(([, files]) => files.has(filePath)).map(([home]) => home)).toHaveLength(
        1
      );
    }
  });

  it('leaves no dependency reference outside the serialized graph', async () => {
    const { input } = createFixture({ isAbsent: syntheticAbsent, fileHashes: hashes('H1') });
    const serialized = serializeManifest(await buildManifest(stats, input));

    for (const file of Object.values(serialized.files)) {
      expect(file.dependencies.every((dependency) => dependency in serialized.files)).toBe(true);
    }
    expect(serialized.files['./src/probe/globalRoot.tsx'].dependencies).toEqual([
      './src/probe/hiddenInner.tsx',
    ]);
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

  it('leaves the swept story subtree in globals rather than draining it', async () => {
    const { disk, input } = createFixture({ isAbsent: globAbsent });
    disk.fileHashes = { [story]: 'S', [swept]: 'W', [shared]: 'R' };
    const manifest = await buildManifest(stats, input);
    // The drain: were the swept story a story file, its subtree would be story-reachable and so
    // absent from globals, and a change to the shared runtime would move nothing the Index
    // can match.
    expect([...manifest.attribution.storybookGlobals]).toEqual(
      expect.arrayContaining([
        './node_modules/fake-dep/Widget.stories.tsx',
        './node_modules/react-dom/index.js',
      ])
    );
    expect([...manifest.attribution.storyReachable]).toEqual(['./src/lib/Button.stories.tsx']);
  });

  it('recaptures a change to a shared runtime file the swept story imports', async () => {
    const { disk, input } = createFixture({ isAbsent: globAbsent });
    disk.fileHashes = { [story]: 'S', [swept]: 'W', [shared]: 'R' };
    const before = await buildManifest(stats, input);
    disk.fileHashes = { [story]: 'S', [swept]: 'W', [shared]: 'R2' };
    const after = await buildManifest(stats, input);

    expect(after.storybookConfigHashes.get('storybookGlobals')).not.toBe(
      before.storybookConfigHashes.get('storybookGlobals')
    );
  });
});

describe('buildManifest globals closure on a webpack-shaped graph', () => {
  // The builder's generated entries are not files on disk, so nothing seeds the walk from them. The
  // framework's preview runtime is a real file that no story reaches, so it is a seed, and it imports
  // the React runtime that every story also imports. A React upgrade must move the globals digest.
  const story = '/repo/packages/ui/src/lib/Button/Button.stories.tsx';
  const impl = '/repo/packages/ui/src/lib/Button/Button.tsx';
  const preview = '/repo/packages/ui/.storybook/preview.ts';
  const decorator = '/repo/packages/ui/.storybook/decorator.ts';
  const entryPreview = '/repo/packages/ui/node_modules/@storybook/react/dist/entry-preview.js';
  const react = '/repo/packages/ui/node_modules/react/index.js';
  const configEntry = './storybook-config-entry.js';
  const glob = './src/lib/ lazy namespace object';
  const globalsKey = 'storybookGlobals';

  const stats: Stats = {
    modules: [
      { id: 1, name: glob, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: story, reasons: [{ moduleName: glob }] },
      { id: 3, name: impl, reasons: [{ moduleName: story }] },
      { id: 4, name: react, reasons: [{ moduleName: impl }, { moduleName: entryPreview }] },
      { id: 5, name: preview, reasons: [{ moduleName: configEntry }] },
      { id: 6, name: decorator, reasons: [{ moduleName: preview }] },
      { id: 7, name: entryPreview, reasons: [{ moduleName: configEntry }] },
    ],
  };
  const hashes = {
    [story]: 'S',
    [impl]: 'B',
    [preview]: 'P',
    [decorator]: 'D',
    [entryPreview]: 'EP',
    [react]: 'R',
  };

  it('puts the React runtime in both the story subtree and globals', async () => {
    const { disk, input } = createFixture({ isAbsent: syntheticAbsent });
    disk.fileHashes = { ...hashes };

    const { attribution } = await buildManifest(stats, input);

    expect(attribution.storyReachable.has('./node_modules/react/index.js')).toBe(true);
    expect([...attribution.storybookGlobals].sort()).toEqual([
      './node_modules/@storybook/react/dist/entry-preview.js',
      './node_modules/react/index.js',
    ]);
  });

  it('moves the globals digest when the React runtime changes', async () => {
    const { disk, input } = createFixture({ isAbsent: syntheticAbsent });
    disk.fileHashes = { ...hashes };
    const before = await buildManifest(stats, input);
    disk.fileHashes = { ...hashes, [react]: 'R2' };
    const after = await buildManifest(stats, input);

    expect(after.storybookConfigHashes.get(globalsKey)).not.toBe(
      before.storybookConfigHashes.get(globalsKey)
    );
  });

  it('keeps the preview subtree and the story implementation out of globals', async () => {
    const { disk, input } = createFixture({ isAbsent: syntheticAbsent });
    disk.fileHashes = { ...hashes };

    const { attribution } = await buildManifest(stats, input);

    expect(attribution.storybookGlobals.has('./.storybook/preview.ts')).toBe(false);
    expect(attribution.storybookGlobals.has('./.storybook/decorator.ts')).toBe(false);
    expect(attribution.storybookGlobals.has('./src/lib/Button/Button.tsx')).toBe(false);
  });
});

describe('buildManifest globals through the builder config entry', () => {
  // Webpack and Rspack use a generated config entry to load preview annotations for every story.
  // Because that entry has no file on disk, the stats reader recognizes its name and supplies it as
  // a global root. These tests cover both cases: a story imports the addon annotation directly, or
  // only the config entry imports it. The addon must remain global in either case so all stories
  // are retested when its runtime changes.
  const configEntry = './storybook-config-entry.js';
  const glob = './src/ lazy namespace object';
  const importingStory = '/repo/packages/ui/src/Button.stories.tsx';
  const otherStory = '/repo/packages/ui/src/Badge.stories.tsx';
  const addonAnnotation = '/repo/packages/ui/local-addon/preview.js';
  const addonRuntime = '/repo/packages/ui/local-addon/runtime.js';
  const storyOnlyHelper = '/repo/packages/ui/src/format.ts';

  function makeStats(storyImportsAddon: boolean): Stats {
    return {
      modules: [
        { id: 1, name: glob, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: importingStory, reasons: [{ moduleName: glob }] },
        { id: 3, name: otherStory, reasons: [{ moduleName: glob }] },
        {
          id: 4,
          name: addonAnnotation,
          reasons: storyImportsAddon
            ? [{ moduleName: configEntry }, { moduleName: importingStory }]
            : [{ moduleName: configEntry }],
        },
        { id: 5, name: addonRuntime, reasons: [{ moduleName: addonAnnotation }] },
        { id: 6, name: storyOnlyHelper, reasons: [{ moduleName: importingStory }] },
      ],
    };
  }

  const hashes = {
    [importingStory]: 'S1',
    [otherStory]: 'S2',
    [addonAnnotation]: 'A',
    [addonRuntime]: 'R',
    [storyOnlyHelper]: 'F',
  };

  it.each([
    ['the story does not import the addon entry', false],
    ['the story imports the addon entry', true],
  ])('keeps the addon annotation and its runtime global when %s', async (_, storyImportsAddon) => {
    const { input } = createFixture({ isAbsent: syntheticAbsent, fileHashes: { ...hashes } });

    const { attribution } = await buildManifest(makeStats(storyImportsAddon), input);

    expect([...attribution.storybookGlobals].sort()).toEqual([
      './local-addon/preview.js',
      './local-addon/runtime.js',
    ]);
    // `format.ts` is imported only by the story, so it must not become global.
    expect(attribution.storybookGlobals.has('./src/format.ts')).toBe(false);
    expect(attribution.storyReachable.has('./src/format.ts')).toBe(true);
  });

  it.each([
    ['the story does not import the addon entry', false],
    ['the story imports the addon entry', true],
  ])(
    'moves the globals digest when the addon runtime changes and %s',
    async (_, storyImportsAddon) => {
      const { disk, input } = createFixture({
        isAbsent: syntheticAbsent,
        fileHashes: { ...hashes },
      });
      const stats = makeStats(storyImportsAddon);
      const before = await buildManifest(stats, input);

      disk.fileHashes = { ...hashes, [addonRuntime]: 'R2' };
      const after = await buildManifest(stats, input);

      expect(after.storybookConfigHashes.get('storybookGlobals')).not.toBe(
        before.storybookConfigHashes.get('storybookGlobals')
      );
      // Badge does not import the addon, so its story hash stays the same. The changed globals hash
      // is what ensures Badge is retested.
      expect(after.storyFileHashes.get('./src/Badge.stories.tsx')).toBe(
        before.storyFileHashes.get('./src/Badge.stories.tsx')
      );
    }
  );

  it('moves the importing story hash as well, only when that story imports the addon', async () => {
    const overlapping = createFixture({ isAbsent: syntheticAbsent, fileHashes: { ...hashes } });
    const separate = createFixture({ isAbsent: syntheticAbsent, fileHashes: { ...hashes } });
    const changed = { ...hashes, [addonRuntime]: 'R2' };

    const beforeOverlap = await buildManifest(makeStats(true), overlapping.input);
    overlapping.disk.fileHashes = { ...changed };
    const afterOverlap = await buildManifest(makeStats(true), overlapping.input);

    const beforeSeparate = await buildManifest(makeStats(false), separate.input);
    separate.disk.fileHashes = { ...changed };
    const afterSeparate = await buildManifest(makeStats(false), separate.input);

    const story = './src/Button.stories.tsx';
    expect(afterOverlap.storyFileHashes.get(story)).not.toBe(
      beforeOverlap.storyFileHashes.get(story)
    );
    expect(afterSeparate.storyFileHashes.get(story)).toBe(
      beforeSeparate.storyFileHashes.get(story)
    );
  });

  it('keeps the generated config entry out of every attribution set', async () => {
    const { input } = createFixture({ isAbsent: syntheticAbsent, fileHashes: { ...hashes } });

    const { attribution } = await buildManifest(makeStats(true), input);

    const all = [
      ...attribution.storyReachable,
      ...attribution.previewSubtree,
      ...attribution.storybookGlobals,
    ];
    expect(all.some((filePath) => filePath.includes('storybook-config-entry'))).toBe(false);
    expect(all.some((filePath) => filePath.includes('lazy'))).toBe(false);
  });

  it('covers every hashed file with at least one attribution home', async () => {
    const { input } = createFixture({ isAbsent: syntheticAbsent, fileHashes: { ...hashes } });

    const manifest = await buildManifest(makeStats(true), input);
    const { storyReachable, previewSubtree, storybookGlobals } = manifest.attribution;
    const attributed = new Set([...storyReachable, ...previewSubtree, ...storybookGlobals]);

    // Attribution sets may overlap, but their union must contain every hashed file.
    expect([...attributed].sort()).toEqual(
      [...manifest.files]
        .filter(([, file]) => file.hash !== '')
        .map(([filePath]) => filePath)
        .sort()
    );
  });

  it('does not enter a story subtree through the entry that discovers stories', async () => {
    // The config entry also imports the story-discovery glob. The globals walk must stop at story
    // files; otherwise every story dependency would be incorrectly classified as global.
    const component = '/repo/packages/ui/src/Button.tsx';
    const { input } = createFixture({
      isAbsent: syntheticAbsent,
      fileHashes: { ...hashes, [component]: 'C' },
    });
    const stats = makeStats(true);
    stats.modules.push({ id: 7, name: component, reasons: [{ moduleName: importingStory }] });
    stats.modules[0].reasons = [{ moduleName: configEntry }];

    const { attribution } = await buildManifest(stats, input);

    expect(attribution.storybookGlobals.has('./src/Button.tsx')).toBe(false);
    expect(attribution.storybookGlobals.has('./src/Button.stories.tsx')).toBe(false);
    expect(attribution.storyReachable.has('./src/Button.tsx')).toBe(true);
  });
  it.each([
    ['the story does not import the addon', false],
    ['the story imports the addon', true],
  ])(
    'keeps a runtime upgrade global when the story imports the runtime directly and %s',
    async (_, storyImportsAddon) => {
      // The story imports the runtime itself, not only through the addon. The runtime is
      // story-reachable either way, so only the walk from the config entry keeps it global.
      const runtime = '/repo/packages/ui/node_modules/example-runtime/index.js';
      const stats: Stats = {
        modules: [
          { id: 1, name: glob, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: importingStory, reasons: [{ moduleName: glob }] },
          { id: 3, name: otherStory, reasons: [{ moduleName: glob }] },
          {
            id: 4,
            name: addonAnnotation,
            reasons: storyImportsAddon
              ? [{ moduleName: configEntry }, { moduleName: importingStory }]
              : [{ moduleName: configEntry }],
          },
          {
            id: 5,
            name: runtime,
            reasons: [{ moduleName: addonAnnotation }, { moduleName: importingStory }],
          },
        ],
      };
      const runtimeHashes = {
        [importingStory]: 'S1',
        [otherStory]: 'S2',
        [addonAnnotation]: 'A',
        [runtime]: 'R1',
      };
      const { disk, input } = createFixture({
        isAbsent: syntheticAbsent,
        fileHashes: { ...runtimeHashes },
      });
      const before = await buildManifest(stats, input);

      disk.fileHashes = { ...runtimeHashes, [runtime]: 'R2' };
      const after = await buildManifest(stats, input);

      expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
        before.storyFileHashes.get('./src/Button.stories.tsx')
      );
      expect(after.storyFileHashes.get('./src/Badge.stories.tsx')).toBe(
        before.storyFileHashes.get('./src/Badge.stories.tsx')
      );
      expect(after.storybookConfigHashes.get('storybookGlobals')).not.toBe(
        before.storybookConfigHashes.get('storybookGlobals')
      );
    }
  );
});

describe('buildManifest globals through a Vite composition root', () => {
  // Storybook 8 and 9 load preview annotations from Vite's generated app module instead of a config
  // entry. The app module is synthetic, but it serves the same purpose: everything it reaches is
  // loaded for every story. This fixture also checks that an annotation remains global when a story
  // imports it directly.
  const viteApp = '/virtual:/@storybook/builder-vite/vite-app.js';
  const storiesEntry = '/virtual:/@storybook/builder-vite/storybook-stories.js';
  const story = '/repo/packages/ui/src/Button.stories.tsx';
  const annotation = '/repo/packages/ui/node_modules/@storybook/react/dist/entry-preview.mjs';
  const annotationRuntime = '/repo/packages/ui/node_modules/@storybook/react/dist/chunk-abc.mjs';
  const storyOnlyHelper = '/repo/packages/ui/src/format.ts';

  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: storiesEntry }] },
      {
        id: 2,
        name: annotation,
        reasons: [{ moduleName: viteApp }, { moduleName: story }],
      },
      { id: 3, name: annotationRuntime, reasons: [{ moduleName: annotation }] },
      { id: 4, name: storyOnlyHelper, reasons: [{ moduleName: story }] },
    ],
  };

  const hashes = {
    [story]: 'S',
    [annotation]: 'A',
    [annotationRuntime]: 'AR',
    [storyOnlyHelper]: 'F',
  };

  it('keeps an annotation a story also imports, and its runtime, in globals', async () => {
    const { input } = createFixture({ fileHashes: { ...hashes } });

    const { attribution } = await buildManifest(stats, input);

    expect([...attribution.storybookGlobals].sort()).toEqual([
      './node_modules/@storybook/react/dist/chunk-abc.mjs',
      './node_modules/@storybook/react/dist/entry-preview.mjs',
    ]);
    expect(
      attribution.storyReachable.has('./node_modules/@storybook/react/dist/entry-preview.mjs')
    ).toBe(true);
    // `format.ts` is imported only by the story, so it must not become global.
    expect(attribution.storybookGlobals.has('./src/format.ts')).toBe(false);
  });

  it('moves the globals digest when the annotation runtime changes', async () => {
    const { disk, input } = createFixture({ fileHashes: { ...hashes } });
    const before = await buildManifest(stats, input);

    disk.fileHashes = { ...hashes, [annotationRuntime]: 'AR2' };
    const after = await buildManifest(stats, input);

    expect(after.storybookConfigHashes.get('storybookGlobals')).not.toBe(
      before.storybookConfigHashes.get('storybookGlobals')
    );
  });

  it('still falls back to disconnected real files when no root reaches them', async () => {
    // Some Vite stats omit the composition edge. The fallback treats a hashed file as global when
    // it belongs to neither a story subtree nor the preview subtree.
    const orphan = '/repo/packages/ui/node_modules/storybook/dist/preview/runtime.js';
    const { input } = createFixture({ fileHashes: { ...hashes, [orphan]: 'O' } });

    const { attribution } = await buildManifest(
      { modules: [...stats.modules, { id: 5, name: orphan, reasons: [] }] },
      input
    );

    expect(
      attribution.storybookGlobals.has('./node_modules/storybook/dist/preview/runtime.js')
    ).toBe(true);
  });
});

describe('buildManifest globals through the Storybook 10 Vite annotations module', () => {
  // Since Storybook 10.3.0, Vite loads annotations through `project-annotations` instead of
  // directly from the app module. The globals walk must follow this extra hop while still stopping
  // before the app module's story-discovery branch.
  const viteApp = '/virtual:/@storybook/builder-vite/vite-app.js';
  const annotationsModule = '/virtual:/@storybook/builder-vite/project-annotations.js';
  const storiesEntry = '/virtual:/@storybook/builder-vite/storybook-stories.js';
  const importingStory = '/repo/packages/ui/src/Button.stories.tsx';
  const otherStory = '/repo/packages/ui/src/Badge.stories.tsx';
  const component = '/repo/packages/ui/src/Button.tsx';
  const addonAnnotation = '/repo/packages/ui/local-addon/preview.js';
  const addonRuntime = '/repo/packages/ui/local-addon/runtime.js';

  const stats: Stats = {
    modules: [
      { id: 1, name: annotationsModule, reasons: [{ moduleName: viteApp }] },
      { id: 2, name: storiesEntry, reasons: [{ moduleName: viteApp }] },
      { id: 3, name: importingStory, reasons: [{ moduleName: storiesEntry }] },
      { id: 4, name: otherStory, reasons: [{ moduleName: storiesEntry }] },
      { id: 5, name: component, reasons: [{ moduleName: importingStory }] },
      {
        id: 6,
        name: addonAnnotation,
        reasons: [{ moduleName: annotationsModule }, { moduleName: importingStory }],
      },
      {
        id: 7,
        name: addonRuntime,
        reasons: [{ moduleName: addonAnnotation }, { moduleName: importingStory }],
      },
    ],
  };

  const hashes = {
    [importingStory]: 'S1',
    [otherStory]: 'S2',
    [component]: 'C',
    [addonAnnotation]: 'A',
    [addonRuntime]: 'R',
  };

  it('reaches the annotations through the extra hop and leaves story code alone', async () => {
    const { input } = createFixture({ fileHashes: { ...hashes } });

    const { attribution } = await buildManifest(stats, input);

    expect([...attribution.storybookGlobals].sort()).toEqual([
      './local-addon/preview.js',
      './local-addon/runtime.js',
    ]);
    expect(attribution.storybookGlobals.has('./src/Button.tsx')).toBe(false);
    expect(attribution.storyReachable.has('./src/Button.tsx')).toBe(true);
  });

  it('moves the globals digest when the addon runtime changes, leaving other stories untouched', async () => {
    const { disk, input } = createFixture({ fileHashes: { ...hashes } });
    const before = await buildManifest(stats, input);

    disk.fileHashes = { ...hashes, [addonRuntime]: 'R2' };
    const after = await buildManifest(stats, input);

    expect(after.storybookConfigHashes.get('storybookGlobals')).not.toBe(
      before.storybookConfigHashes.get('storybookGlobals')
    );
    expect(after.storyFileHashes.get('./src/Badge.stories.tsx')).toBe(
      before.storyFileHashes.get('./src/Badge.stories.tsx')
    );
  });
});
