import { beforeEach, describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import { disk, outOfGraph, projectRoot, resetDisk } from './__fixtures__/manifestFixtures';
import { buildManifest } from './manifest';

/**
 * ============================================================================
 *  GOLDEN HASHES — DO NOT UPDATE TO MAKE A FAILURE GO AWAY
 * ============================================================================
 *
 * These are the exact hashes the manifest publishes for a frozen fixture. The rest of the suite
 * asserts hashes *relationally* ("this changes when that changes"), which cannot see a change to the
 * hash recipe itself: reorder the fields in `hashEntryIdentity`, drop its length prefixes, or change
 * what a roll-up folds in, and every relational test stays green while every published hash moves.
 * This test is the only thing that catches that.
 *
 * WHY A FAILURE HERE MATTERS MORE THAN IT LOOKS
 *
 * These hashes are not local to one build. The backend compares a build's hashes against those
 * stored for its *baselines*, so a recipe change does not bust one build's cache — it busts the
 * comparison between every new build and every baseline recorded by an older CLI. That is every
 * branch with a baseline, on every project, all at once: each one sees every story as changed and
 * full-snapshots on its next run, and it stays that way until each branch has re-baselined under the
 * new recipe. On a busy repo that is a large, and billable, snapshot spike.
 *
 * So: a diff here means the change under review invalidates TurboSnap caches fleet-wide. That is
 * sometimes the right call, but it is never an incidental one.
 *
 * IF THIS TEST FAILS
 *
 *   1. You did not mean to change the hash recipe. Revert — the refactor was not behaviour-preserving.
 *   2. You did mean to. Confirm the fleet-wide re-baseline is acceptable and intended, say so in the
 *      PR description, then update the constants below in the same commit.
 *
 * Never regenerate these values without reading the diff first.
 */

// A fixture exercising every section that feeds a published hash: two stories with a shared and a
// private dependency, a preview config with its own subtree, an orphan global reached only through
// the framework's preview annotations, and both out-of-graph sweeps. Frozen — changing the fixture
// changes the golden values without any recipe change, which defeats the point of the test.
const buttonStory = '/repo/packages/ui/src/Button.stories.tsx';
const headerStory = '/repo/packages/ui/src/Header.stories.tsx';
const tokens = '/repo/packages/ui/src/tokens.ts';
const moment = '/repo/packages/ui/node_modules/moment/moment.js';
const preview = '/repo/packages/ui/.storybook/preview.ts';
const previewTheme = '/repo/packages/ui/.storybook/theme.ts';
const entryPreview = '/repo/packages/ui/node_modules/@storybook/react/dist/entry-preview.js';

const GOLDEN_STATS: Stats = {
  modules: [
    { id: 1, name: buttonStory, reasons: [{ moduleName: './storybook-stories.js' }] },
    { id: 2, name: headerStory, reasons: [{ moduleName: './storybook-stories.js' }] },
    { id: 3, name: tokens, reasons: [{ moduleName: buttonStory }, { moduleName: headerStory }] },
    { id: 4, name: moment, reasons: [{ moduleName: buttonStory }] },
    { id: 5, name: preview, reasons: [{ moduleName: './storybook-config-entry.js' }] },
    { id: 6, name: previewTheme, reasons: [{ moduleName: preview }] },
    { id: 7, name: entryPreview, reasons: [{ moduleName: './storybook-config-entry.js' }] },
  ],
} as unknown as Stats;

const GOLDEN_FILE_HASHES = {
  [buttonStory]: 'aaaaaaaaaaaaaaaa',
  [headerStory]: 'bbbbbbbbbbbbbbbb',
  [tokens]: 'cccccccccccccccc',
  [moment]: 'dddddddddddddddd',
  [preview]: 'eeeeeeeeeeeeeeee',
  [previewTheme]: 'ffffffffffffffff',
  [entryPreview]: '1111111111111111',
  '/repo/packages/ui/.storybook/main.ts': '2222222222222222',
  '/repo/packages/ui/.storybook/static/mockServiceWorker.js': '3333333333333333',
};

const GOLDEN_DIRECTORY_TREE = {
  '/repo/packages/ui/.storybook': ['main.ts', 'preview.ts', 'theme.ts', 'static'],
  '/repo/packages/ui/.storybook/static': ['mockServiceWorker.js'],
};

// The published values. See the header before touching these.
const GOLDEN_STORYBOOK_HASH = '0fcb504ca8999c5e';

const GOLDEN_STORY_FILES: Record<string, string> = {
  './src/Button.stories.tsx': 'cb54ddff8d709d58',
  './src/Header.stories.tsx': 'b91201ce599d85d4',
};

const GOLDEN_STORYBOOK_FILES: Record<string, string> = {
  './.storybook/preview.ts': '50834b9899fad324',
  storybookGlobals: '872cd67e6a14077f',
  storybookVersion: '9.1.20',
  storybookConfig: '15c4a036658aed13',
  staticFiles: '2ccde8021fdfb2d8',
};

describe('manifest golden hashes', () => {
  beforeEach(() => {
    resetDisk();
    disk.current.fileHashes = { ...GOLDEN_FILE_HASHES };
    disk.current.directories = { ...GOLDEN_DIRECTORY_TREE };
    // Pinned here rather than taken from the fixture default, so a Storybook release — or an edit to
    // that default — cannot move the golden values.
    disk.current.packageVersions = { storybook: '9.1.20' };
  });

  it('publishes the same storybookHash for the frozen fixture', async () => {
    const manifest = await buildManifest(GOLDEN_STATS, projectRoot, outOfGraph);

    expect(manifest.storybookHash).toBe(GOLDEN_STORYBOOK_HASH);
  });

  it('publishes the same per-story hashes for the frozen fixture', async () => {
    const manifest = await buildManifest(GOLDEN_STATS, projectRoot, outOfGraph);

    expect(Object.fromEntries(manifest.storyFileHashes)).toEqual(GOLDEN_STORY_FILES);
  });

  it('publishes the same storybookFiles hashes for the frozen fixture', async () => {
    const manifest = await buildManifest(GOLDEN_STATS, projectRoot, outOfGraph);

    expect(Object.fromEntries(manifest.storybookFiles)).toEqual(GOLDEN_STORYBOOK_FILES);
  });
});
