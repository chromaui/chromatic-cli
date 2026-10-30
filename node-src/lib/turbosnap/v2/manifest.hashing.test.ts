/* eslint-disable max-lines */
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

  it('leaves the story hash alone when an untracked leaf dependency changes content', async () => {
    const { disk, input } = createFixture({ isUntracked: (candidate) => candidate === leaf });
    disk.fileHashes = { [story]: 'S', [leaf]: 'T1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [story]: 'S', [leaf]: 'T2' };
    const after = await buildManifest(stats, input);

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
    expect(after.storybookHash).toBe(before.storybookHash);
  });

  it('leaves the story hash alone when an untraced leaf dependency changes content', async () => {
    const { disk, input } = createFixture();
    const untracedInput = { ...input, untraced: ['packages/ui/src/theme.ts'] };
    disk.fileHashes = { [story]: 'S', [leaf]: 'T1' };
    const before = await buildManifest(stats, untracedInput);

    disk.fileHashes = { [story]: 'S', [leaf]: 'T2' };
    const after = await buildManifest(stats, untracedInput);

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
    expect(after.storybookHash).toBe(before.storybookHash);
    expect([...after.skippedFiles]).toEqual([['./src/theme.ts', 'untraced']]);
  });
});

describe('buildManifest of a file git does not track, ignored or not', () => {
  const story = '/repo/packages/ui/src/Button.stories.tsx';
  const preview = '/repo/packages/ui/.storybook/preview.ts';
  const buildInfo = '/repo/packages/ui/src/generated/build-info.json';

  // A CI step writes build-info.json before the Storybook build, with a fresh timestamp each time,
  // and no one commits it or lists it in .gitignore. The preview imports it. v1's `git diff` never
  // sees it, so neither should the config roll-up, until it is committed.
  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: preview, reasons: [{ moduleName: './storybook-config-entry.js' }] },
      { id: 3, name: buildInfo, reasons: [{ moduleName: preview }] },
    ],
  };

  it('leaves the config hashes alone while it is untracked, and moves the preview once it is tracked', async () => {
    let untracked = true;
    const { disk, input } = createFixture({
      isUntracked: (candidate) => untracked && candidate === buildInfo,
    });

    disk.fileHashes = { [story]: 'S', [preview]: 'P', [buildInfo]: 'B1' };
    const before = await buildManifest(stats, input);
    disk.fileHashes = { [story]: 'S', [preview]: 'P', [buildInfo]: 'B2' };
    const after = await buildManifest(stats, input);

    expect([...after.storybookConfigHashes]).toEqual([...before.storybookConfigHashes]);
    expect([...after.skippedFiles]).toEqual([['./src/generated/build-info.json', 'untracked']]);

    untracked = false;
    disk.fileHashes = { [story]: 'S', [preview]: 'P', [buildInfo]: 'B1' };
    const trackedBefore = await buildManifest(stats, input);
    disk.fileHashes = { [story]: 'S', [preview]: 'P', [buildInfo]: 'B2' };
    const trackedAfter = await buildManifest(stats, input);

    expect(trackedAfter.storybookConfigHashes.get('preview')).not.toBe(
      trackedBefore.storybookConfigHashes.get('preview')
    );
  });
});

describe('buildManifest of a story file git does not track', () => {
  const story = '/repo/packages/ui/src/generated/Button.stories.tsx';
  const button = '/repo/packages/ui/src/Button.tsx';

  // Git does not track the story file: it is generated, or not yet added. It is still a story file,
  // so a new one is captured for having no baseline, and the tracked Button.tsx it imports is what
  // its hash must follow. Its own edits go unseen until it is tracked, as v1's `git diff` never
  // lists it either.
  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: button, reasons: [{ moduleName: story }] },
    ],
  };

  it('changes the story hash when a tracked import changes content, and not when the story file does', async () => {
    const { disk, input } = createFixture({ isUntracked: (candidate) => candidate === story });
    disk.fileHashes = { [story]: 'S1', [button]: 'B1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [story]: 'S2', [button]: 'B1' };
    const storyEdited = await buildManifest(stats, input);
    disk.fileHashes = { [story]: 'S1', [button]: 'B2' };
    const importEdited = await buildManifest(stats, input);

    const key = './src/generated/Button.stories.tsx';
    expect(storyEdited.storyFileHashes.get(key)).toBe(before.storyFileHashes.get(key));
    expect(importEdited.storyFileHashes.get(key)).not.toBe(before.storyFileHashes.get(key));
  });
});

describe('buildManifest through a file git ignores', () => {
  const story = '/repo/packages/ui/src/Button.stories.tsx';
  const barrel = '/repo/packages/ui/src/generated/index.ts';
  const button = '/repo/packages/ui/src/Button.tsx';

  // The barrel is generated and git ignores it, but it re-exports the tracked Button.tsx. The story
  // only reaches Button.tsx through the barrel.
  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: barrel, reasons: [{ moduleName: story }] },
      { id: 3, name: button, reasons: [{ moduleName: barrel }] },
    ],
  };

  it('changes the story hash when a tracked file behind the ignored file changes content', async () => {
    const { disk, input } = createFixture({ isUntracked: (candidate) => candidate === barrel });
    disk.fileHashes = { [story]: 'S', [barrel]: 'G', [button]: 'B1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [story]: 'S', [barrel]: 'G', [button]: 'B2' };
    const after = await buildManifest(stats, input);

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
  });

  it('leaves the story hash alone when the ignored file is removed from the import graph', async () => {
    // Button.tsx is still imported, now directly. The barrel contributed nothing, not even its path.
    const { disk, input } = createFixture({ isUntracked: (candidate) => candidate === barrel });
    disk.fileHashes = { [story]: 'S', [barrel]: 'G', [button]: 'B' };
    const before = await buildManifest(stats, input);

    const withoutBarrel: Stats = {
      modules: [
        { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 3, name: button, reasons: [{ moduleName: story }] },
      ],
    };
    const after = await buildManifest(withoutBarrel, input);

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
  });
});

describe("buildManifest through a workspace package's build output", () => {
  const story = '/repo/packages/ui/src/Button.stories.tsx';
  const built = '/repo/packages/icons/dist/index.js';

  // The bundler resolves `@acme/icons` through its node_modules link to the package's gitignored
  // `dist`, so that is the only form of the package the graph holds. It is skipped, as v1 skips it:
  // git sees a build artifact. `--externals` cannot glob that `dist` — it matches only tracked
  // files — so the escape hatch for teams that rebuild it is a glob on the package's source.
  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: built, reasons: [{ moduleName: story }] },
    ],
  };

  it("leaves the story hash alone when the build output changes content, since git ignores it, and keeps the story's edge to it", async () => {
    const { disk, input } = createFixture({ isUntracked: (candidate) => candidate === built });
    disk.fileHashes = { [story]: 'S', [built]: 'D1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [story]: 'S', [built]: 'D2' };
    const after = await buildManifest(stats, input);

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
    expect([...after.skippedFiles]).toEqual([['../icons/dist/index.js', 'untracked']]);
    expect(
      after.files.get('./src/Button.stories.tsx')?.dependencies.has('../icons/dist/index.js')
    ).toBe(true);
  });
});

describe("buildManifest through a sibling package's tracked source", () => {
  const story = '/repo/packages/ui/src/Button.stories.tsx';
  const index = '/repo/packages/shared/src/index.ts';
  const generated = '/repo/packages/shared/src/generated.ts';

  // The story imports the sibling's tracked entry, which imports a generated file git ignores. A
  // non-deterministic generated file must not move the story hash; a change to the tracked file
  // behind it still must — the sibling mirror of the leaf-inclusion suites above.
  const stats: Stats = {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: index, reasons: [{ moduleName: story }] },
      { id: 3, name: generated, reasons: [{ moduleName: index }] },
    ],
  };

  it("leaves the story hash alone when the sibling's gitignored generated file changes content, and moves it when the tracked import does", async () => {
    const { disk, input } = createFixture({ isUntracked: (candidate) => candidate === generated });
    disk.fileHashes = { [story]: 'S', [index]: 'I1', [generated]: 'G1' };
    const before = await buildManifest(stats, input);

    disk.fileHashes = { [story]: 'S', [index]: 'I1', [generated]: 'G2' };
    const generatedEdited = await buildManifest(stats, input);
    disk.fileHashes = { [story]: 'S', [index]: 'I2', [generated]: 'G1' };
    const indexEdited = await buildManifest(stats, input);

    const key = './src/Button.stories.tsx';
    expect(generatedEdited.storyFileHashes.get(key)).toBe(before.storyFileHashes.get(key));
    expect(indexEdited.storyFileHashes.get(key)).not.toBe(before.storyFileHashes.get(key));
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
      disk.directories = { '/repo/apps/web/ui/.storybook': ['main.ts'] };
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
        {
          ...input,
          projectRoot: '/repo/apps/web/ui',
          configDir: '/repo/apps/web/ui/.storybook',
          staticDirs: ['/repo/apps/web/ui/.storybook/static'],
        }
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
    expect(after.storybookConfigHashes.get('preview')).not.toBe(
      before.storybookConfigHashes.get('preview')
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

// A file of `@emotion/react` in the pnpm store directory named `directory`.
function theme(directory: string) {
  return `/repo/node_modules/.pnpm/${directory}/node_modules/@emotion/react/dist/index.js`;
}

describe('buildManifest across a pnpm peer rename', () => {
  const story = '/repo/packages/ui/src/Button.stories.tsx';
  const preview = '/repo/packages/ui/.storybook/preview.ts';

  // Preview and the story each import `@emotion/react`, from the store directory named for them.
  // pnpm renames a directory when a peer changes, and a rename can leave the two in different copies.
  async function manifestFor(directories: { preview: string; story: string }, themeHash = 'E') {
    const { input } = createFixture({
      fileHashes: {
        [story]: 'S',
        [preview]: 'P',
        [theme(directories.preview)]: themeHash,
        [theme(directories.story)]: themeHash,
      },
    });
    const themeImporters = (directory: string) =>
      [
        directory === directories.preview && { moduleName: preview },
        directory === directories.story && { moduleName: story },
      ].filter((reason) => !!reason);
    return buildManifest(
      {
        modules: [
          { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: preview, reasons: [{ moduleName: './storybook-config-entry.js' }] },
          ...[...new Set([directories.preview, directories.story])].map((directory, index) => ({
            id: 3 + index,
            name: theme(directory),
            reasons: themeImporters(directory),
          })),
        ],
      },
      input
    );
  }

  const peerA = '@emotion+react@11.14.0_@types+react@19.2.2_react@19.2.0';
  const peerB = '@emotion+react@11.14.0_@types+react@19.2.3_react@19.2.0';

  it('leaves every hash alone when only the store directory of a single copy is renamed', async () => {
    const before = await manifestFor({ preview: peerA, story: peerA });
    const after = await manifestFor({ preview: peerB, story: peerB });

    expect([...after.files.keys()]).not.toEqual([...before.files.keys()]);
    expect([...after.storybookConfigHashes]).toEqual([...before.storybookConfigHashes]);
    expect([...after.storyFileHashes]).toEqual([...before.storyFileHashes]);
    expect(after.storybookHash).toBe(before.storybookHash);
  });

  it('changes the hashes when the package content changes', async () => {
    const before = await manifestFor({ preview: peerA, story: peerA }, 'E1');
    const after = await manifestFor({ preview: peerB, story: peerB }, 'E2');

    expect(after.storybookConfigHashes.get('preview')).not.toBe(
      before.storybookConfigHashes.get('preview')
    );
    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
  });

  it('changes the hashes when a rename splits the package into a second copy', async () => {
    // Both copies have identical bytes, but each holds its own module state: the story's copy no
    // longer sees the theme preview provides through the other one.
    const before = await manifestFor({ preview: peerA, story: peerA });
    const after = await manifestFor({ preview: peerA, story: peerB });

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
  });
});
