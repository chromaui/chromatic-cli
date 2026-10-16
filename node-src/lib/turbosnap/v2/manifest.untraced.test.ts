import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import { createFixture, syntheticAbsent } from './__fixtures__/manifestFixtures';
import { buildManifest } from './manifest';
import { InMemoryDisk } from './projectFiles.fake';
import { buildSkipRule } from './skippedFiles';
import { readStatsGraph } from './statsGraph';

// These suites pin the two `--untraced` recipes the docs give: untracing a barrel, and untracing a
// global decorator. Both rely on an untraced file being a wall, as it is in v1, rather than a file
// whose own bytes merely go unhashed. They run end-to-end through buildManifest because the claim
// spans the graph, the globals fallback and the config sweep together.
// The concatenation suites below pin the same walls under webpack/rspack module groups.

const viaBarrel = '/repo/packages/ui/src/Modal.stories.tsx';
const direct = '/repo/packages/ui/src/Button.stories.tsx';
const barrel = '/repo/packages/ui/src/components/index.ts';
const button = '/repo/packages/ui/src/components/Button.tsx';

function barrelFixture() {
  const { disk, input } = createFixture({ isAbsent: syntheticAbsent });
  return { disk, input: { ...input, untraced: ['packages/ui/src/components/index.ts'] } };
}

describe('buildManifest through an untraced barrel', () => {
  // Untrace a barrel, and everything it re-exports goes untraced with it as long as it is not
  // imported directly. v1 stops its trace at the barrel, so v2 severs its edges.
  it('recaptures a story that imports the changed file directly, and not one that reaches it only through the barrel', async () => {
    const stats: Stats = {
      modules: [
        { id: 1, name: viaBarrel, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: direct, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 3, name: barrel, reasons: [{ moduleName: viaBarrel }] },
        { id: 4, name: button, reasons: [{ moduleName: barrel }, { moduleName: direct }] },
      ],
    };
    const { disk, input } = barrelFixture();
    disk.fileHashes = { [viaBarrel]: 'M', [direct]: 'S', [barrel]: 'I', [button]: 'B1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [viaBarrel]: 'M', [direct]: 'S', [barrel]: 'I', [button]: 'B2' };
    const after = await buildManifest(stats, input);

    expect(after.storyFileHashes.get('./src/Modal.stories.tsx')).toBe(
      before.storyFileHashes.get('./src/Modal.stories.tsx')
    );
    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
  });

  it('moves no hash at all when a file only the barrel reaches changes, rather than adopting it as a global', async () => {
    const stats: Stats = {
      modules: [
        { id: 1, name: viaBarrel, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 3, name: barrel, reasons: [{ moduleName: viaBarrel }] },
        { id: 4, name: button, reasons: [{ moduleName: barrel }] },
      ],
    };
    const { disk, input } = barrelFixture();
    disk.fileHashes = { [viaBarrel]: 'M', [barrel]: 'I', [button]: 'B1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [viaBarrel]: 'M', [barrel]: 'I', [button]: 'B2' };
    const after = await buildManifest(stats, input);

    expect(after.storybookHash).toBe(before.storybookHash);
    expect([...after.attribution.storybookGlobals]).toEqual([]);
    expect([...after.skippedFiles]).toEqual([['./src/components/index.ts', 'untraced']]);
  });
});

const story = '/repo/packages/ui/src/Button.stories.tsx';
const preview = '/repo/packages/ui/.storybook/preview.ts';
const decorator = '/repo/packages/ui/.storybook/decorators/withTheme.ts';
const utility = '/repo/packages/ui/src/theme.ts';

function decoratorFixture() {
  const { disk, input } = createFixture({
    isAbsent: syntheticAbsent,
    directories: {
      '/repo/packages/ui/.storybook': ['main.ts', 'preview.ts', 'decorators'],
      '/repo/packages/ui/.storybook/decorators': ['withTheme.ts'],
    },
  });
  return { disk, input: { ...input, untraced: ['**/.storybook/decorators/*.ts'] } };
}

describe('buildManifest with an untraced global decorator', () => {
  // `--untraced ".storybook/decorators/*.js"` keeps a change to the utilities a global decorator
  // imports from re-testing the entire Storybook. The decorator sits in the config directory, so the
  // config sweep has to honor the glob as well as the graph.
  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: preview, reasons: [{ moduleName: './storybook-config-entry.js' }] },
      { id: 3, name: decorator, reasons: [{ moduleName: preview }] },
      { id: 4, name: utility, reasons: [{ moduleName: decorator }] },
    ],
  };

  it('leaves every hash alone when a utility the decorator imports changes', async () => {
    const { disk, input } = decoratorFixture();
    disk.fileHashes = { [story]: 'S', [preview]: 'P', [decorator]: 'D', [utility]: 'T1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [story]: 'S', [preview]: 'P', [decorator]: 'D', [utility]: 'T2' };
    const after = await buildManifest(stats, input);

    expect(after.storybookHash).toBe(before.storybookHash);
  });

  it('leaves every hash alone when the decorator itself changes, in the config sweep as in the graph', async () => {
    const { disk, input } = decoratorFixture();
    disk.fileHashes = { [story]: 'S', [preview]: 'P', [decorator]: 'D1', [utility]: 'T' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [story]: 'S', [preview]: 'P', [decorator]: 'D2', [utility]: 'T' };
    const after = await buildManifest(stats, input);

    expect(after.storybookHash).toBe(before.storybookHash);
    expect([...after.skippedFiles]).toEqual([['./.storybook/decorators/withTheme.ts', 'untraced']]);
  });

  it('still moves the storybook hash when the preview itself changes', async () => {
    const { disk, input } = decoratorFixture();
    disk.fileHashes = { [story]: 'S', [preview]: 'P1', [decorator]: 'D', [utility]: 'T' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [story]: 'S', [preview]: 'P2', [decorator]: 'D', [utility]: 'T' };
    const after = await buildManifest(stats, input);

    expect(after.storybookHash).not.toBe(before.storybookHash);
  });

  it('honors the glob in a config dir reached through a symlink, since the glob names the real path as v1 would', async () => {
    const linkedConfigDirectory = '/repo/apps/storybook/.storybook';
    const linkedDecorator = `${linkedConfigDirectory}/decorators/withTheme.ts`;
    const { disk, input: fixtureInput } = createFixture({
      isAbsent: syntheticAbsent,
      directories: {
        [linkedConfigDirectory]: ['main.ts', 'preview.ts', 'decorators'],
        [`${linkedConfigDirectory}/decorators`]: ['withTheme.ts'],
      },
    });
    const input = {
      ...fixtureInput,
      configDir: linkedConfigDirectory,
      untraced: ['packages/ui/.storybook/decorators/*.ts'],
      projectFiles: {
        ...fixtureInput.projectFiles,
        realPath: (absolutePath: string) =>
          absolutePath.replace('/repo/apps/storybook', '/repo/packages/ui'),
      },
    };
    disk.fileHashes = { [story]: 'S', [preview]: 'P', [decorator]: 'D1', [linkedDecorator]: 'D1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [story]: 'S', [preview]: 'P', [decorator]: 'D2', [linkedDecorator]: 'D2' };
    const after = await buildManifest(stats, input);

    expect(after.storybookHash).toBe(before.storybookHash);
  });

  it('still moves the storybook hash when the main config changes under a glob that untraces the whole config dir', async () => {
    const main = '/repo/packages/ui/.storybook/main.ts';
    const { disk, input: fixtureInput } = decoratorFixture();
    const input = { ...fixtureInput, untraced: ['**/.storybook/**'] };
    disk.fileHashes = {
      [story]: 'S',
      [preview]: 'P',
      [decorator]: 'D',
      [utility]: 'T',
      [main]: 'M1',
    };
    const before = await buildManifest(stats, input);

    disk.fileHashes = {
      [story]: 'S',
      [preview]: 'P',
      [decorator]: 'D',
      [utility]: 'T',
      [main]: 'M2',
    };
    const after = await buildManifest(stats, input);

    expect(after.storybookHash).not.toBe(before.storybookHash);
    expect(after.skippedFiles.has('./.storybook/main.ts')).toBe(false);
  });
});

// Webpack/rspack blame member imports on the group root; the graph attributes the edge to the
// reason's `resolvedModule`, so an untraced file inside the group walls off its own imports.

const previewConfigDirectory = { '/repo/packages/ui/.storybook': ['main.ts', 'preview.js'] };
const previewUntraced = ['packages/ui/.storybook/preview.js'];

// A stats module record; `id` is noise in these suites.
const statsModule = (name: string, rest: Partial<Stats['modules'][number]> = {}) => ({
  id: null,
  name,
  ...rest,
});

function untracedFixture(untraced: string[], directories?: InMemoryDisk['directories']) {
  const { disk, input } = createFixture({
    isAbsent: syntheticAbsent,
    ...(directories && { directories }),
  });
  return { disk, input: { ...input, untraced } };
}

describe('buildManifest with an untraced preview concatenated into the config entry', () => {
  const story = '/repo/packages/ui/src/Button.stories.tsx';
  const preview = '/repo/packages/ui/.storybook/preview.js';
  const hello = '/repo/packages/ui/src/hello.js';
  const hello2 = '/repo/packages/ui/src/hello2.js';
  const configEntry = './storybook-config-entry.js';
  const previewSubtreeKeys = ['./.storybook/preview.js', './src/hello.js', './src/hello2.js'];
  const groupReason = { moduleName: `${configEntry} + 2 modules`, resolvedModule: preview };

  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
      statsModule(`${configEntry} + 2 modules`, {
        id: configEntry,
        modules: [{ name: configEntry }, { name: preview }, { name: './storybook-stories.js' }],
        reasons: [{ moduleName: null, resolvedModule: null }],
      }),
      statsModule(preview, { reasons: [{ moduleName: configEntry, resolvedModule: configEntry }] }),
      statsModule(hello, {
        reasons: [groupReason, { moduleName: preview, resolvedModule: preview }],
      }),
      statsModule(hello2, { reasons: [{ moduleName: hello, resolvedModule: hello }] }),
    ],
  };

  it("records no edge from the config entry to the preview's imports, and walls them off", async () => {
    const { input } = untracedFixture(previewUntraced, previewConfigDirectory);
    const skipRule = await buildSkipRule(input);
    const graph = await readStatsGraph(stats, input, skipRule);

    // hello.js's only importer is the untraced preview: no edge from the group root survives.
    expect([...(graph.files.get(configEntry)?.dependencies ?? [])]).not.toContain('./src/hello.js');
    expect([...graph.untracedSubtrees].sort()).toEqual(previewSubtreeKeys);
  });

  it('moves no hash when a file behind the untraced preview import chain changes', async () => {
    const { disk, input } = untracedFixture(previewUntraced, previewConfigDirectory);
    disk.fileHashes = { [story]: 'S', [preview]: 'P', [hello]: 'H1', [hello2]: 'G1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [story]: 'S', [preview]: 'P', [hello]: 'H2', [hello2]: 'G1' };
    const afterHello = await buildManifest(stats, input);

    // hello2 sits one step further behind the wall: the preview imports hello, which imports it.
    disk.fileHashes = { [story]: 'S', [preview]: 'P', [hello]: 'H2', [hello2]: 'G2' };
    const afterHello2 = await buildManifest(stats, input);

    for (const after of [afterHello, afterHello2]) {
      expect(after.storybookHash).toBe(before.storybookHash);
      expect(after.storybookConfigHashes).toEqual(before.storybookConfigHashes);
      expect(after.storyFileHashes).toEqual(before.storyFileHashes);
      expect([...after.skippedFiles]).toEqual([['./.storybook/preview.js', 'untraced']]);
      expect([...after.attribution.storybookGlobals]).toEqual([]);
      expect([...after.attribution.previewSubtree]).toEqual([]);
    }
  });

  it('still traces the preview subtree when nothing is untraced (control)', async () => {
    const { disk, input } = untracedFixture([], previewConfigDirectory);
    disk.fileHashes = { [story]: 'S', [preview]: 'P', [hello]: 'H1', [hello2]: 'G' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [story]: 'S', [preview]: 'P', [hello]: 'H2', [hello2]: 'G' };
    const after = await buildManifest(stats, input);

    expect(after.storybookConfigHashes.get('preview')).not.toBe(
      before.storybookConfigHashes.get('preview')
    );
    expect(after.storybookHash).not.toBe(before.storybookHash);
    expect(after.storyFileHashes).toEqual(before.storyFileHashes);
    for (const [key, hash] of before.storybookConfigHashes) {
      if (key === 'preview') continue;
      expect(after.storybookConfigHashes.get(key), `${key} should not move`).toBe(hash);
    }
    expect([...after.attribution.previewSubtree]).toContain('./src/hello.js');
  });

  it('still recaptures a story that imports the file directly, with the preview untraced (control)', async () => {
    const story2 = '/repo/packages/ui/src/Info.stories.tsx';
    const helloReasons = stats.modules.find((module) => module.name === hello)?.reasons ?? [];
    const withDirectImporter: Stats = {
      modules: [
        ...stats.modules.filter((module) => module.name !== hello),
        {
          id: null,
          name: hello,
          reasons: [...helloReasons, { moduleName: story2, resolvedModule: story2 }],
        },
        { id: 6, name: story2, reasons: [{ moduleName: './storybook-stories.js' }] },
      ],
    };
    const { disk, input } = untracedFixture(previewUntraced, previewConfigDirectory);
    disk.fileHashes = { [story]: 'S', [preview]: 'P', [hello]: 'H1', [hello2]: 'G', [story2]: 'I' };
    const before = await buildManifest(withDirectImporter, input);

    disk.fileHashes = { [story]: 'S', [preview]: 'P', [hello]: 'H2', [hello2]: 'G', [story2]: 'I' };
    const after = await buildManifest(withDirectImporter, input);

    expect(after.storyFileHashes.get('./src/Info.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Info.stories.tsx')
    );
    expect(after.storybookConfigHashes).toEqual(before.storybookConfigHashes);
  });
});

describe('buildManifest with an untraced component concatenated into its story', () => {
  // Only `resolvedModule` names the component; untracing it must wall off what it imports.
  const fooStory = '/repo/packages/ui/src/Foo.stories.tsx';
  const foo = '/repo/packages/ui/src/Foo.tsx';
  const dep = '/repo/packages/ui/src/dep.ts';

  const stats: Stats = {
    modules: [
      statsModule(`${fooStory} + 1 modules`, {
        id: 1,
        modules: [{ name: fooStory }, { name: foo }],
        reasons: [{ moduleName: './storybook-stories.js' }],
      }),
      statsModule(dep, {
        reasons: [{ moduleName: `${fooStory} + 1 modules`, resolvedModule: foo }],
      }),
    ],
  };

  it('moves no hash when a file the untraced component imports changes', async () => {
    const { disk, input } = untracedFixture(['packages/ui/src/Foo.tsx']);
    disk.fileHashes = { [fooStory]: 'S', [foo]: 'F', [dep]: 'D1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [fooStory]: 'S', [foo]: 'F', [dep]: 'D2' };
    const after = await buildManifest(stats, input);

    expect(after.storyFileHashes.get('./src/Foo.stories.tsx')).toBe(
      before.storyFileHashes.get('./src/Foo.stories.tsx')
    );
    expect([...after.skippedFiles]).toEqual([['./src/Foo.tsx', 'untraced']]);
  });

  it('still recaptures the story through the traced component when nothing is untraced (control)', async () => {
    const { disk, input } = untracedFixture([]);
    disk.fileHashes = { [fooStory]: 'S', [foo]: 'F', [dep]: 'D1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [fooStory]: 'S', [foo]: 'F', [dep]: 'D2' };
    const after = await buildManifest(stats, input);

    expect(after.storyFileHashes.get('./src/Foo.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Foo.stories.tsx')
    );
  });
});

describe('buildManifest with an untraced concatenation root', () => {
  // The untraced file is itself the group root; root-attributed edges already wall these off.
  const wallStory = '/repo/packages/ui/src/Wall.stories.tsx';
  const wallSubtreeKeys = ['./src/behind.js', './src/deep.js', './src/wall.js'];
  const wall = '/repo/packages/ui/src/wall.js';
  const behind = '/repo/packages/ui/src/behind.js';
  const deep = '/repo/packages/ui/src/deep.js';

  const stats: Stats = {
    modules: [
      { id: 1, name: wallStory, reasons: [{ moduleName: './storybook-stories.js' }] },
      statsModule(`${wall} + 1 modules`, {
        id: 2,
        modules: [{ name: wall }, { name: behind }],
        reasons: [{ moduleName: wallStory, resolvedModule: wallStory }],
      }),
      statsModule(deep, {
        reasons: [{ moduleName: `${wall} + 1 modules`, resolvedModule: behind }],
      }),
    ],
  };

  it('keeps walling off the whole group, whatever distance behind it', async () => {
    const { disk, input } = untracedFixture(['packages/ui/src/wall.js']);
    const skipRule = await buildSkipRule(input);
    const graph = await readStatsGraph(stats, input, skipRule);
    expect([...graph.untracedSubtrees].sort()).toEqual(wallSubtreeKeys);

    disk.fileHashes = { [wallStory]: 'S', [wall]: 'W', [behind]: 'B1', [deep]: 'D' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [wallStory]: 'S', [wall]: 'W', [behind]: 'B2', [deep]: 'D' };
    const afterBehind = await buildManifest(stats, input);

    disk.fileHashes = { [wallStory]: 'S', [wall]: 'W', [behind]: 'B1', [deep]: 'D2' };
    const afterDeep = await buildManifest(stats, input);

    expect(afterBehind.storybookHash).toBe(before.storybookHash);
    expect(afterBehind.storyFileHashes).toEqual(before.storyFileHashes);
    expect(afterDeep.storybookHash).toBe(before.storybookHash);
    expect(afterDeep.storyFileHashes).toEqual(before.storyFileHashes);
    expect([...afterBehind.skippedFiles]).toEqual([['./src/wall.js', 'untraced']]);
    expect([...afterBehind.attribution.storybookGlobals]).toEqual([]);
  });

  it('still recaptures the story through the traced group when nothing is untraced (control)', async () => {
    const { disk, input } = untracedFixture([]);
    disk.fileHashes = { [wallStory]: 'S', [wall]: 'W', [behind]: 'B1', [deep]: 'D1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [wallStory]: 'S', [wall]: 'W', [behind]: 'B1', [deep]: 'D2' };
    const after = await buildManifest(stats, input);

    expect(after.storyFileHashes.get('./src/Wall.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Wall.stories.tsx')
    );
  });
});
