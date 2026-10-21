import { describe, expect, it } from 'vitest';

import { createFixture } from './__fixtures__/manifestFixtures';
import { buildManifest } from './manifest';

// pnpm names each `.pnpm` store directory after the package's version and its resolved peers, so a
// peer bump renames the directory with no byte changed. These suites pin which of those renames move
// a hash; see `buildPnpmRollUpPath`.

describe('buildManifest through a pnpm virtual store', () => {
  const story = '/repo/packages/ui/src/Button.stories.tsx';
  const preview = '/repo/packages/ui/.storybook/preview.tsx';
  const store = '/repo/node_modules/.pnpm';
  const emotionFile = '@emotion/react/dist/emotion-react.esm.js';
  const emotion = (storeDirectory: string) =>
    `${store}/${storeDirectory}/node_modules/${emotionFile}`;
  const peersA = '@emotion+react@11.14.0_@types+react@19.2.1_react@19.2.0';
  const peersB = '@emotion+react@11.14.0_@types+react@19.2.2_react@19.2.0';

  // The preview provides a theme and the story consumes it, each through its own import of the package.
  const build = (previewCopy: string, storyCopy: string) =>
    buildWith(emotion(previewCopy), emotion(storyCopy));
  const buildWith = (previewCopy: string, storyCopy: string) => {
    const { input } = createFixture({
      fileHashes: {
        [story]: 'S',
        [preview]: 'P',
        [previewCopy]: 'E',
        [storyCopy]: 'E',
      },
    });
    return buildManifest(
      {
        modules: [
          { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: preview, reasons: [{ moduleName: './storybook-config-entry.js' }] },
          { id: 3, name: previewCopy, reasons: [{ moduleName: preview }] },
          { id: 4, name: storyCopy, reasons: [{ moduleName: story }] },
        ],
      },
      input
    );
  };

  it('changes nothing when a peer bump renames the only copy of a package', async () => {
    const before = await build(peersA, peersA);
    const after = await build(peersB, peersB);

    expect(after.storyFileHashes).toEqual(before.storyFileHashes);
    expect(after.storybookConfigHashes).toEqual(before.storybookConfigHashes);
    expect(after.storybookHash).toBe(before.storybookHash);
    // Manifest keys still name the real file on disk.
    expect(
      after.files.has(
        `../../node_modules/.pnpm/${peersB}/node_modules/@emotion/react/dist/emotion-react.esm.js`
      )
    ).toBe(true);
  });

  it('moves the hashes when a peer split leaves two copies of a package, even with identical bytes', async () => {
    // Two copies no longer share a React context, so the story can render differently. Normalizing
    // both to one path would leave every roll-up unchanged and hide that.
    const before = await build(peersA, peersA);
    const after = await build(peersA, peersB);

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
    expect(after.storybookHash).not.toBe(before.storybookHash);
  });

  it('moves the hashes when a symlinked import adds a second copy, even with identical bytes', async () => {
    // pnpm's top-level `node_modules/<package>` symlink spells the same path the store copy rolls up
    // as. A bundler that names one import through the link loads a second instance, so the store
    // copy must keep its real path or the two would roll up as one.
    const before = await build(peersA, peersA);
    const after = await buildWith(`/repo/node_modules/${emotionFile}`, emotion(peersA));

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
    expect(after.storybookHash).not.toBe(before.storybookHash);
  });
});
