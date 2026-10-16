import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import { createFixture, syntheticAbsent } from './__fixtures__/manifestFixtures';
import { buildManifest } from './manifest';
import { InMemoryDisk } from './projectFiles.fake';
import { buildSkipRule } from './skippedFiles';
import { readStatsGraph } from './statsGraph';

// These suites pin the `--untraced` walls of `manifest.untraced.test.ts` under webpack/rspack
// module concatenation. Webpack/rspack blame member imports on the group root; the graph
// attributes each edge to the member the reason resolves to, so an untraced file inside the group
// walls off its own imports.

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

  it('moves no hash when the file the untraced component imports is concatenated into the same group', async () => {
    // The group lists every member, but each member's own reasons say which member imports it:
    // the root must not reach `dep` around the untraced component.
    const group = `${fooStory} + 2 modules`;
    const sharedGroup: Stats = {
      modules: [
        statsModule(group, {
          id: 1,
          modules: [{ name: fooStory }, { name: foo }, { name: dep }],
          reasons: [{ moduleName: './storybook-stories.js' }],
        }),
        statsModule(foo, { reasons: [{ moduleName: group, resolvedModule: fooStory }] }),
        statsModule(dep, { reasons: [{ moduleName: group, resolvedModule: foo }] }),
      ],
    };
    const { disk, input } = untracedFixture(['packages/ui/src/Foo.tsx']);
    disk.fileHashes = { [fooStory]: 'S', [foo]: 'F', [dep]: 'D1' };
    const before = await buildManifest(sharedGroup, input);

    disk.fileHashes = { [fooStory]: 'S', [foo]: 'F', [dep]: 'D2' };
    const after = await buildManifest(sharedGroup, input);

    expect(after.storyFileHashes.get('./src/Foo.stories.tsx')).toBe(
      before.storyFileHashes.get('./src/Foo.stories.tsx')
    );
    expect(after.storybookHash).toBe(before.storybookHash);
  });

  it('moves no hash when a stylesheet the untraced component imports is also reported against the group', async () => {
    // Webpack's CSS pipeline emits a second record for the stylesheet whose reason blames the group
    // and resolves to the stylesheet itself; that must not link the root to it past the component.
    const group = `${fooStory} + 2 modules`;
    const styles = '/repo/packages/ui/src/foo.css';
    const cssPipeline: Stats = {
      modules: [
        statsModule(group, {
          id: 1,
          modules: [{ name: fooStory }, { name: foo }, { name: styles }],
          reasons: [{ moduleName: './storybook-stories.js' }],
        }),
        statsModule(foo, { reasons: [{ moduleName: group, resolvedModule: fooStory }] }),
        statsModule(styles, { reasons: [{ moduleName: foo, resolvedModule: foo }] }),
        statsModule(`css ${styles}`, {
          nameForCondition: styles,
          reasons: [{ moduleName: group, resolvedModule: styles }],
        }),
      ],
    };
    const { disk, input } = untracedFixture(['packages/ui/src/Foo.tsx']);
    disk.fileHashes = { [fooStory]: 'S', [foo]: 'F', [styles]: 'C1' };
    const before = await buildManifest(cssPipeline, input);

    disk.fileHashes = { [fooStory]: 'S', [foo]: 'F', [styles]: 'C2' };
    const after = await buildManifest(cssPipeline, input);

    expect(after.storyFileHashes.get('./src/Foo.stories.tsx')).toBe(
      before.storyFileHashes.get('./src/Foo.stories.tsx')
    );
    expect(after.storybookHash).toBe(before.storybookHash);
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

describe('buildManifest with an untraced component concatenated into its story under rspack', () => {
  // The record shapes rspack 1.7 emits: `resolvedModule` (and even the component's own `name`)
  // spell the group, so only `resolvedModuleIdentifier` names the component.
  const fooStory = '/repo/packages/ui/src/Foo.stories.tsx';
  const foo = '/repo/packages/ui/src/Foo.tsx';
  const dep = '/repo/packages/ui/src/dep.ts';
  const group = './src/Foo.stories.tsx + 2 modules';
  const storyId = `csf-loader!builtin:swc-loader??ruleSet[1].rules[6].use[0]!${fooStory}`;
  const fooId = `builtin:swc-loader??ruleSet[1].rules[6].use[0]!${foo}`;
  const depId = `builtin:swc-loader??ruleSet[1].rules[6].use[0]!${dep}`;

  const stats: Stats = {
    modules: [
      statsModule(group, {
        identifier: `${storyId}|ce9324acab456de5`,
        nameForCondition: fooStory,
        modules: [
          { identifier: storyId, name: './src/Foo.stories.tsx', nameForCondition: fooStory },
          { identifier: fooId, name: group, nameForCondition: foo },
          { identifier: depId, name: './src/dep.ts', nameForCondition: dep },
        ],
        reasons: [{ moduleName: './storybook-stories.js' }],
      }),
      statsModule(group, {
        identifier: fooId,
        nameForCondition: foo,
        reasons: [
          {
            moduleName: './src/Foo.stories.tsx',
            resolvedModule: './src/Foo.stories.tsx',
            resolvedModuleIdentifier: storyId,
          },
        ],
      }),
      statsModule('./src/dep.ts', {
        identifier: depId,
        nameForCondition: dep,
        reasons: [{ moduleName: group, resolvedModule: group, resolvedModuleIdentifier: fooId }],
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
    expect(after.storybookHash).toBe(before.storybookHash);
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
