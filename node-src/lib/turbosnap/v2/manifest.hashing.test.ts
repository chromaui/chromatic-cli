import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import { createFixture, manifestWithPreview } from './__fixtures__/manifestFixtures';
import { buildManifest } from './manifest';

// These suites are about how a hash responds: what moves it, what leaves it alone, and what stays
// stable when the project moves. They run end-to-end through buildManifest on purpose — the claim is
// about the whole pipeline, not about any one step. Builder spellings live in statsGraph.test.ts.

describe('buildManifest', () => {
  it('keys story files by their canonical project-root-relative path', async () => {
    const { input } = createFixture();
    const stats: Stats = {
      modules: [
        {
          id: 1,
          name: '/repo/packages/ui/src/Button.stories.tsx',
          reasons: [{ moduleName: './storybook-stories.js' }],
        },
        {
          id: 2,
          name: '/repo/packages/ui/src/helper.ts',
          reasons: [{ moduleName: '/repo/packages/ui/src/Button.stories.tsx' }],
        },
      ],
    };

    const manifest = await buildManifest(stats, input);

    expect([...manifest.storyFileHashes.keys()]).toEqual(['./src/Button.stories.tsx']);
    expect(manifest.files.has('./src/Button.stories.tsx')).toBe(true);
  });
});

describe('buildManifest leaf inclusion', () => {
  const story = '/repo/packages/ui/src/Button.stories.tsx';
  const leaf = '/repo/packages/ui/src/theme.ts';

  // theme.ts is a leaf: the story imports it, but it imports nothing itself.
  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: leaf, reasons: [{ moduleName: story }] },
    ],
  };

  it('changes the story hash when a leaf dependency content changes', async () => {
    const { disk, input } = createFixture();
    disk.fileHashes = { [story]: 'S', [leaf]: 'T1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [story]: 'S', [leaf]: 'T2' };
    const after = await buildManifest(stats, input);

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
  });
});

describe('buildManifest relocation stability', () => {
  it('changes nothing at all when the whole project moves', async () => {
    const { disk, input } = createFixture();
    const before = await (async () => {
      disk.fileHashes = {
        '/repo/packages/ui/src/Button.stories.tsx': 'S',
        '/repo/packages/ui/src/helper.ts': 'H',
      };
      return buildManifest(
        {
          modules: [
            {
              id: 1,
              name: '/repo/packages/ui/src/Button.stories.tsx',
              reasons: [{ moduleName: './storybook-stories.js' }],
            },
            {
              id: 2,
              name: '/repo/packages/ui/src/helper.ts',
              reasons: [{ moduleName: '/repo/packages/ui/src/Button.stories.tsx' }],
            },
          ],
        },
        input
      );
    })();

    const after = await (async () => {
      disk.fileHashes = {
        '/repo/apps/web/ui/src/Button.stories.tsx': 'S',
        '/repo/apps/web/ui/src/helper.ts': 'H',
      };
      return buildManifest(
        {
          modules: [
            {
              id: 1,
              name: '/repo/apps/web/ui/src/Button.stories.tsx',
              reasons: [{ moduleName: './storybook-stories.js' }],
            },
            {
              id: 2,
              name: '/repo/apps/web/ui/src/helper.ts',
              reasons: [{ moduleName: '/repo/apps/web/ui/src/Button.stories.tsx' }],
            },
          ],
        },
        { ...input, projectRoot: '/repo/apps/web/ui' }
      );
    })();

    // The keys are project-relative, so moving the whole project moves nothing at all: same keys,
    // same hashes, same gate. The stories still render identically, so nothing should recapture.
    expect([...after.storyFileHashes.keys()]).toEqual(['./src/Button.stories.tsx']);
    expect([...after.storyFileHashes.keys()]).toEqual([...before.storyFileHashes.keys()]);
    expect([...after.storyFileHashes.values()]).toEqual([...before.storyFileHashes.values()]);
    expect(after.storybookHash).toBe(before.storybookHash);
  });

  it('changes the storybook hash when a Storybook-wide file is renamed within the project', async () => {
    // A project move no longer touches any key, so the case that proves keys are in the gate is a
    // rename *inside* the project: `preview.ts` -> `preview.tsx`, byte-for-byte identical.
    const before = await manifestWithPreview('preview.ts');
    const after = await manifestWithPreview('preview.tsx');

    // The `preview` roll-up folds in each file's path as well as its bytes, so renaming preview.ts to
    // preview.tsx moves the rolled-up value even though its key stays `preview`...
    expect(after.storybookFileHashes.get('preview')).not.toBe(
      before.storybookFileHashes.get('preview')
    );
    // ...and that value feeds the gate, so the rename shows up in the storybook hash too.
    expect(after.storybookHash).not.toBe(before.storybookHash);
  });

  it('re-keys a story file and moves the gate when the file is renamed within the project', async () => {
    const { disk, input } = createFixture();
    // An autotitled story derives its title, and so its story IDs, from its path: moving
    // `lib/Badge/AutoTitle.stories.tsx` to `lib/Renamed/` renames every story it holds without
    // changing a byte. The snapshots are keyed by those IDs, so the gate has to move.
    const helper = '/repo/packages/ui/src/helper.ts';
    async function manifestWithStoryAt(story: string) {
      disk.fileHashes = { [story]: 'S', [helper]: 'H' };
      return buildManifest(
        {
          modules: [
            { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
            { id: 2, name: helper, reasons: [{ moduleName: story }] },
          ],
        },
        input
      );
    }

    const before = await manifestWithStoryAt(
      '/repo/packages/ui/src/lib/Badge/AutoTitle.stories.tsx'
    );
    const after = await manifestWithStoryAt(
      '/repo/packages/ui/src/lib/Renamed/AutoTitle.stories.tsx'
    );

    expect([...before.storyFileHashes.keys()]).toEqual(['./src/lib/Badge/AutoTitle.stories.tsx']);
    expect([...after.storyFileHashes.keys()]).toEqual(['./src/lib/Renamed/AutoTitle.stories.tsx']);
    // The roll-up covers the story file's own path, so the hash moves under its new key...
    expect(after.storyFileHashes.get('./src/lib/Renamed/AutoTitle.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/lib/Badge/AutoTitle.stories.tsx')
    );
    // ...and the key is part of the gate too, so the rename is doubly visible.
    expect(after.storybookHash).not.toBe(before.storybookHash);
  });

  it('moves a story hash when a dependency moves within the project', async () => {
    const { disk, input } = createFixture();
    const story = '/repo/packages/ui/src/Button.stories.tsx';

    // Build 1: deps a.ts and b.ts sort as [Button, a, b].
    disk.fileHashes = {
      [story]: 'S',
      '/repo/packages/ui/src/a.ts': 'HA',
      '/repo/packages/ui/src/b.ts': 'HB',
    };
    const before = await buildManifest(
      {
        modules: [
          { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: '/repo/packages/ui/src/a.ts', reasons: [{ moduleName: story }] },
          { id: 3, name: '/repo/packages/ui/src/b.ts', reasons: [{ moduleName: story }] },
        ],
      },
      input
    );

    // Build 2: a.ts moved to z.ts (content unchanged). A module's own path reaches the output — it
    // is baked into `import.meta.url`, emitted chunk names and CSS-Module class names — so the same
    // bytes at a new path can render differently and the story has to recapture.
    disk.fileHashes = {
      [story]: 'S',
      '/repo/packages/ui/src/z.ts': 'HA',
      '/repo/packages/ui/src/b.ts': 'HB',
    };
    const after = await buildManifest(
      {
        modules: [
          { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: '/repo/packages/ui/src/z.ts', reasons: [{ moduleName: story }] },
          { id: 3, name: '/repo/packages/ui/src/b.ts', reasons: [{ moduleName: story }] },
        ],
      },
      input
    );

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
  });

  it('moves a story hash when an external dependency relocates further from the project', async () => {
    const { disk, input } = createFixture();
    const story = '/repo/packages/ui/src/Button.stories.tsx';

    // Build 1: theme.ts lives in a sibling package. Anchored at the git root it keys as
    // '../shared/theme.ts'.
    disk.fileHashes = {
      [story]: 'S',
      '/repo/packages/shared/theme.ts': 'HT',
    };
    const before = await buildManifest(
      {
        modules: [
          { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: '/repo/packages/shared/theme.ts', reasons: [{ moduleName: story }] },
        ],
      },
      input
    );

    // Build 2: the repo is restructured so theme.ts moves up to the repo root ('shared/theme.ts'),
    // but its content is unchanged. The story and its internal dependencies don't move. The key
    // still moves relative to the project root, so the story recaptures — over-capture in the safe
    // direction, and what a tracing v1 does here too.
    disk.fileHashes = {
      [story]: 'S',
      '/repo/shared/theme.ts': 'HT',
    };
    const after = await buildManifest(
      {
        modules: [
          { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: '/repo/shared/theme.ts', reasons: [{ moduleName: story }] },
        ],
      },
      input
    );

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
  });

  it('recaptures every dependent and moves the gate when a shared module moves with its bytes intact', async () => {
    const { disk, input } = createFixture();
    // The measured v1-parity regression: `Badge.tsx` -> `Badge/index.tsx` left the gate SAME and
    // recaptured 0 stories, while a tracing v1 recaptured both importers. Neither importer's bytes
    // change — only the moved module's path does.
    const badgeStory = '/repo/packages/ui/src/Badge.stories.tsx';
    const cardStory = '/repo/packages/ui/src/UserCard.stories.tsx';
    const manifestWithBadgeAt = async (badge: string) => {
      disk.fileHashes = { [badgeStory]: 'S1', [cardStory]: 'S2', [badge]: 'B' };
      return buildManifest(
        {
          modules: [
            { id: 1, name: badgeStory, reasons: [{ moduleName: './storybook-stories.js' }] },
            { id: 2, name: cardStory, reasons: [{ moduleName: './storybook-stories.js' }] },
            {
              id: 3,
              name: badge,
              reasons: [{ moduleName: badgeStory }, { moduleName: cardStory }],
            },
          ],
        },
        input
      );
    };

    const before = await manifestWithBadgeAt('/repo/packages/ui/src/Badge.tsx');
    const after = await manifestWithBadgeAt('/repo/packages/ui/src/Badge/index.tsx');

    expect(after.storyFileHashes.get('./src/Badge.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Badge.stories.tsx')
    );
    expect(after.storyFileHashes.get('./src/UserCard.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/UserCard.stories.tsx')
    );
    expect(after.storybookHash).not.toBe(before.storybookHash);
  });

  it('produces the same storybookHash regardless of module iteration order', async () => {
    const { input } = createFixture({
      fileHashes: {
        '/repo/packages/ui/src/A.stories.tsx': 'HA',
        '/repo/packages/ui/src/B.stories.tsx': 'HB',
      },
    });
    const forwards: Stats = {
      modules: [
        { id: 1, name: './src/A.stories.tsx', reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: './src/B.stories.tsx', reasons: [{ moduleName: './storybook-stories.js' }] },
      ],
    };
    const backwards: Stats = {
      modules: [
        { id: 2, name: './src/B.stories.tsx', reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 1, name: './src/A.stories.tsx', reasons: [{ moduleName: './storybook-stories.js' }] },
      ],
    };

    const first = await buildManifest(forwards, input);
    const second = await buildManifest(backwards, input);

    expect(second.storybookHash).toBe(first.storybookHash);
  });
});
