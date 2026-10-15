import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import { createFixture, syntheticAbsent } from './__fixtures__/manifestFixtures';
import { buildManifest } from './manifest';

// These suites pin the two `--untraced` recipes the docs give: untracing a barrel, and untracing a
// global decorator. Both rely on an untraced file being a wall, as it is in v1, rather than a file
// whose own bytes merely go unhashed. They run end-to-end through buildManifest because the claim
// spans the graph, the globals fallback and the config sweep together.

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
