import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import { rspackStats, webpackStats } from './__fixtures__/concatenatedStats';
import { createFixture, projectRoot, syntheticAbsent } from './__fixtures__/manifestFixtures';
import { buildManifest } from './manifest';

// These suites pin the `--untraced` walls of `manifest.untraced.test.ts` under webpack/rspack
// module concatenation, on stats cut from real builds (see `concatenatedStats.ts`). A group record
// lists every member, but each member's own record says which member imports it; the root must not
// reach a file around the untraced member that imports it.

const configDirectory = { [`${projectRoot}/.storybook`]: ['main.ts', 'preview.js'] };

// Builds the manifest, changes one file's bytes and builds again, with the given files untraced.
async function editAndRebuild(stats: Stats, untraced: string[], edited: string) {
  const { disk, input } = createFixture({
    isAbsent: syntheticAbsent,
    directories: configDirectory,
  });
  const withUntraced = { ...input, untraced };
  const before = await buildManifest(stats, withUntraced);
  disk.fileHashes = { [`${projectRoot}/${edited}`]: 'edited' };
  const after = await buildManifest(stats, withUntraced);
  return { before, after };
}

const button = 'packages/ui/src/Button.js';
const preview = 'packages/ui/.storybook/preview.js';

describe.each([
  { builder: 'webpack', stats: webpackStats },
  { builder: 'rspack', stats: rspackStats },
])('buildManifest with an untraced member of a concatenation group ($builder)', ({ stats }) => {
  // Behind Button.js: dep.js and button.css are concatenated with it, cjsdep.cjs and the css-loader
  // record sit outside the group and blame it, and shared.js is also imported by Other.stories.js.
  it.each([
    { edited: 'src/dep.js', moved: [] },
    { edited: 'src/cjsdep.cjs', moved: [] },
    { edited: 'src/button.css', moved: [] },
    { edited: 'src/shared.js', moved: ['./src/Other.stories.js'] },
  ])('moves only $moved when $edited changes behind it', async ({ edited, moved }) => {
    const { before, after } = await editAndRebuild(stats, [button], edited);

    const movedStories = [...after.storyFileHashes]
      .filter(([story, hash]) => before.storyFileHashes.get(story) !== hash)
      .map(([story]) => story);
    expect(movedStories).toEqual(moved);
    expect(after.storybookConfigHashes).toEqual(before.storybookConfigHashes);

    // Control: with nothing untraced the same edit reaches the story.
    const traced = await editAndRebuild(stats, [], edited);
    expect(traced.after.storyFileHashes.get('./src/Button.stories.js')).not.toBe(
      traced.before.storyFileHashes.get('./src/Button.stories.js')
    );
  });

  it.each(['src/hello.js', 'src/hello2.js'])(
    'moves no hash when %s changes behind an untraced preview',
    async (edited) => {
      const { before, after } = await editAndRebuild(stats, [preview], edited);

      expect(after.storybookHash).toBe(before.storybookHash);
      expect(after.storybookConfigHashes).toEqual(before.storybookConfigHashes);
      expect(after.storyFileHashes).toEqual(before.storyFileHashes);

      // Control: with nothing untraced the same edit moves the preview.
      const traced = await editAndRebuild(stats, [], edited);
      expect(traced.after.storybookConfigHashes.get('preview')).not.toBe(
        traced.before.storybookConfigHashes.get('preview')
      );
    }
  );
});

// storybook-builder-rsbuild 3.3+ writes its own stats: every concatenated member gets a record
// carrying the group's reasons, each reason keeps only `moduleName`, and a group name there is
// rewritten to the member that imports through it. A member whose only reasons are those copies
// is not reached from inside its group, so the root must still link it.
const isGroupName = (name: string) => / \+ \d+ modules?$/.test(name);
const rsbuildStats: Stats = {
  modules: rspackStats.modules.flatMap((module) => {
    if (module.id === null) return [];
    const reasons = (module.reasons ?? []).map(({ moduleName, resolvedModule }) => ({
      moduleName: moduleName && isGroupName(moduleName) ? (resolvedModule ?? null) : moduleName,
    }));
    const members = (module.modules ?? []).map(({ name }) => ({ id: name, name, reasons }));
    return [{ id: module.id, name: module.name, modules: module.modules, reasons }, ...members];
  }),
};

describe('buildManifest with concatenation groups in storybook-builder-rsbuild stats', () => {
  it.each(['src/Button.js', 'src/dep.js', 'src/button.css', 'src/shared.js'])(
    'moves the Button story when %s changes',
    async (edited) => {
      const { before, after } = await editAndRebuild(rsbuildStats, [], edited);

      expect(after.storyFileHashes.get('./src/Button.stories.js')).not.toBe(
        before.storyFileHashes.get('./src/Button.stories.js')
      );
    }
  );
});
