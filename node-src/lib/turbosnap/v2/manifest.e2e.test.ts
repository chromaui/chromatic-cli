import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import { createFixture, projectRoot, syntheticAbsent } from './__fixtures__/manifestFixtures';
import { buildManifest } from './manifest';

// A Vitest build, shaped like the stats `build-archive-storybook` writes: the stories entry imports
// one generated `.stories.json` per test file, which imports that test, which imports the component.
describe('buildManifest for an E2E build', () => {
  const archives = `${projectRoot}/.vitest/chromatic/chromatic-archives`;
  const story = `${archives}/src-button-1.stories.json`;
  const test = `${projectRoot}/src/Button.test.tsx`;
  const component = `${projectRoot}/src/Button.tsx`;

  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: test, reasons: [{ moduleName: story }] },
      { id: 3, name: component, reasons: [{ moduleName: test }] },
    ],
  };

  function e2eFixture() {
    const fixture = createFixture({
      // No config directory, and a `storybook` the project could resolve that is not the one built.
      directories: {},
      packageVersions: { storybook: '10.2.13', '@chromatic-com/vitest': '1.0.2' },
      fileHashes: { [story]: 'S', [test]: 'T', [component]: 'C' },
      isAbsent: syntheticAbsent,
      // The archives are generated into a gitignored directory.
      isUntracked: (absolutePath) => absolutePath.startsWith(archives),
    });
    fixture.input.e2ePackage = '@chromatic-com/vitest';
    return fixture;
  }

  it('stands the E2E package in for the Storybook version and keeps the required config entry', async () => {
    const { input } = e2eFixture();

    const manifest = await buildManifest(stats, input);

    expect(manifest.storybookConfigHashes.get('storybookVersion')).toBe(
      '@chromatic-com/vitest@1.0.2'
    );
    expect(manifest.storybookConfigHashes.get('storybookConfigFiles')).toMatch(/^[\da-f]{16}$/);
    expect([...manifest.storyFileHashes.keys()]).toEqual([
      './.vitest/chromatic/chromatic-archives/src-button-1.stories.json',
    ]);
  });

  it('recaptures every story when the E2E package is upgraded', async () => {
    const { disk, input } = e2eFixture();
    const before = await buildManifest(stats, input);

    disk.packageVersions = { ...disk.packageVersions, '@chromatic-com/vitest': '1.0.3' };
    const after = await buildManifest(stats, input);

    expect(after.storybookConfigHashes.get('storybookVersion')).toBe('@chromatic-com/vitest@1.0.3');
    expect(after.storybookHash).not.toBe(before.storybookHash);
    expect(after.storyFileHashes).toEqual(before.storyFileHashes);
  });

  it('moves a story through its untracked archive when the tested component changes', async () => {
    const { disk, input } = e2eFixture();
    const before = await buildManifest(stats, input);

    disk.fileHashes = { ...disk.fileHashes, [component]: 'C2' };
    const after = await buildManifest(stats, input);

    expect(after.storyFileHashes).not.toEqual(before.storyFileHashes);
    expect(after.storybookConfigHashes).toEqual(before.storybookConfigHashes);
  });

  // chromatic-e2e#463 names story files relative to the project, imported by builder-vite's
  // virtual stories module rather than webpack's.
  it('finds the story files of stats the Vitest reporter writes for the prebuilt Storybook', async () => {
    const { disk, input } = e2eFixture();
    disk.isAbsent = (candidate) => candidate.includes('virtual:');
    const virtualStories = '/virtual:/@storybook/builder-vite/storybook-stories.js';
    const reporterStats: Stats = {
      modules: [
        {
          id: virtualStories,
          name: virtualStories,
          reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/vite-app.js' }],
        },
        {
          id: './.vitest/chromatic/chromatic-archives/src-button-1.stories.json',
          name: '.vitest/chromatic/chromatic-archives/src-button-1.stories.json',
          reasons: [{ moduleName: virtualStories }],
        },
        {
          id: 'src/Button.test.tsx',
          name: 'src/Button.test.tsx',
          reasons: [
            { moduleName: '.vitest/chromatic/chromatic-archives/src-button-1.stories.json' },
          ],
        },
        {
          id: 'src/Button.tsx',
          name: 'src/Button.tsx',
          reasons: [{ moduleName: 'src/Button.test.tsx' }],
        },
      ],
    };
    const before = await buildManifest(reporterStats, input);

    disk.fileHashes = { ...disk.fileHashes, [component]: 'C2' };
    const after = await buildManifest(reporterStats, input);

    expect([...before.storyFileHashes.keys()]).toEqual([
      './.vitest/chromatic/chromatic-archives/src-button-1.stories.json',
    ]);
    expect(after.storyFileHashes).not.toEqual(before.storyFileHashes);
  });

  // Vitest without chromaticPlugin({ turboSnap: true }) writes no stats of its own, so the
  // generated story files import nothing.
  it('refuses to build when no story file reaches a tracked file', async () => {
    const { input } = e2eFixture();
    const storiesOnly: Stats = { modules: [stats.modules[0]] };

    await expect(buildManifest(storiesOnly, input)).rejects.toThrow(
      'Found no tracked files behind the story files of this E2E build.'
    );
  });

  it('refuses to build without the E2E package installed', async () => {
    const { disk, input } = e2eFixture();
    disk.packageVersions = { storybook: '10.2.13' };

    await expect(buildManifest(stats, input)).rejects.toThrow(
      `Could not resolve a version of @chromatic-com/vitest from ${projectRoot}`
    );
  });
});
