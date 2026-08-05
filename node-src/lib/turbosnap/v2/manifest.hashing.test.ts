import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Stats } from '../../../types';
import {
  manifestWithPreview,
  mockStatSync,
  outOfGraph,
  projectRoot,
} from './__fixtures__/manifestFixtures';
import { buildManifest, serializeManifest } from './manifest';

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  // A trailing slash names a directory: present on disk, but not a regular file.
  statSync: (candidate: unknown) => ({ isFile: () => !String(candidate).endsWith('/') }),
  writeFileSync: vi.fn(),
}));

// Hoisted refs the mock factories read, so each test controls the file hashes and the swept
// directory tree; see ./__fixtures__/manifestMocks.
const { fileHashesRef, directoryTreeRef } = vi.hoisted(() => ({
  fileHashesRef: { current: {} as Record<string, string> },
  directoryTreeRef: { current: {} as Record<string, string[]> },
}));

vi.mock('../../getFileHashes', async () => {
  const { fileHashesModule } = await import('./__fixtures__/manifestMocks');
  return fileHashesModule(fileHashesRef);
});

vi.mock('fs/promises', async (importOriginal) => {
  const { directoryTreeModule } = await import('./__fixtures__/manifestMocks');
  return {
    ...(await importOriginal<typeof import('fs/promises')>()),
    ...directoryTreeModule(directoryTreeRef),
  };
});

// The version is read off the resolved Storybook package on disk, which no fixture here installs;
// stub it so these tests exercise graph hashing only. See storybookVersion.test.ts for the probe.
vi.mock('./storybookVersion', () => ({
  resolveStorybookVersion: () => '9.1.20',
}));

beforeEach(() => {
  fileHashesRef.current = {};
  directoryTreeRef.current = {};
});

describe('buildManifest', () => {
  it('keys story files by their canonical project-root-relative path', async () => {
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

    const manifest = await buildManifest(stats, projectRoot, outOfGraph);

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
    fileHashesRef.current = { [story]: 'S', [leaf]: 'T1' };
    const before = await buildManifest(stats, projectRoot, outOfGraph);

    fileHashesRef.current = { [story]: 'S', [leaf]: 'T2' };
    const after = await buildManifest(stats, projectRoot, outOfGraph);

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
  });
});

describe('buildManifest relocation stability', () => {
  it('changes nothing at all when the whole project moves', async () => {
    const before = await (async () => {
      fileHashesRef.current = {
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
        '/repo/packages/ui',
        outOfGraph
      );
    })();

    const after = await (async () => {
      fileHashesRef.current = {
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
        '/repo/apps/web/ui',
        outOfGraph
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
    const before = await manifestWithPreview(fileHashesRef, 'preview.ts');
    const after = await manifestWithPreview(fileHashesRef, 'preview.tsx');

    // The roll-up covers each file's path as well as its bytes, so the entry moves under its new
    // key...
    expect(after.storybookFiles.get('./.storybook/preview.tsx')).not.toBe(
      before.storybookFiles.get('./.storybook/preview.ts')
    );
    // ...and the key is part of the gate too, so the rename is doubly visible.
    expect(after.storybookHash).not.toBe(before.storybookHash);
  });

  it('re-keys a story file and moves the gate when the file is renamed within the project', async () => {
    // An autotitled story derives its title, and so its story IDs, from its path: moving
    // `lib/Badge/AutoTitle.stories.tsx` to `lib/Renamed/` renames every story it holds without
    // changing a byte. The snapshots are keyed by those IDs, so the gate has to move.
    const helper = '/repo/packages/ui/src/helper.ts';
    async function manifestWithStoryAt(story: string) {
      fileHashesRef.current = { [story]: 'S', [helper]: 'H' };
      return buildManifest(
        {
          modules: [
            { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
            { id: 2, name: helper, reasons: [{ moduleName: story }] },
          ],
        },
        projectRoot,
        outOfGraph
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
    const story = '/repo/packages/ui/src/Button.stories.tsx';

    // Build 1: deps a.ts and b.ts sort as [Button, a, b].
    fileHashesRef.current = {
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
      projectRoot,
      outOfGraph
    );

    // Build 2: a.ts moved to z.ts (content unchanged). A module's own path reaches the output — it
    // is baked into `import.meta.url`, emitted chunk names and CSS-Module class names — so the same
    // bytes at a new path can render differently and the story has to recapture.
    fileHashesRef.current = {
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
      projectRoot,
      outOfGraph
    );

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
  });

  it('moves a story hash when an external dependency relocates further from the project', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';

    // Build 1: theme.ts lives in a sibling package. Anchored at the git root it keys as
    // '../shared/theme.ts'.
    fileHashesRef.current = {
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
      projectRoot,
      outOfGraph
    );

    // Build 2: the repo is restructured so theme.ts moves up to the repo root ('shared/theme.ts'),
    // but its content is unchanged. The story and its internal dependencies don't move. The key
    // still moves relative to the project root, so the story recaptures — over-capture in the safe
    // direction, and what a tracing v1 does here too.
    fileHashesRef.current = {
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
      projectRoot,
      outOfGraph
    );

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
  });

  it('recaptures every dependent and moves the gate when a shared module moves with its bytes intact', async () => {
    // The measured v1-parity regression: `Badge.tsx` -> `Badge/index.tsx` left the gate SAME and
    // recaptured 0 stories, while a tracing v1 recaptured both importers. Neither importer's bytes
    // change — only the moved module's path does.
    const badgeStory = '/repo/packages/ui/src/Badge.stories.tsx';
    const cardStory = '/repo/packages/ui/src/UserCard.stories.tsx';
    const manifestWithBadgeAt = async (badge: string) => {
      fileHashesRef.current = { [badgeStory]: 'S1', [cardStory]: 'S2', [badge]: 'B' };
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
        projectRoot,
        outOfGraph
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
    fileHashesRef.current = {
      '/repo/packages/ui/src/A.stories.tsx': 'HA',
      '/repo/packages/ui/src/B.stories.tsx': 'HB',
    };

    const first = await buildManifest(forwards, projectRoot, outOfGraph);
    const second = await buildManifest(backwards, projectRoot, outOfGraph);

    expect(second.storybookHash).toBe(first.storybookHash);
  });
});

describe('buildManifest concatenated modules', () => {
  // Webpack/rspack concatenate the story and its local imports into one module: the module name
  // carries a ` + N modules` suffix and the real files live in `module.modules`.
  const concatenatedStory: Stats = {
    modules: [
      {
        id: 1,
        name: '/repo/packages/ui/src/Button.stories.tsx + 1 modules',
        modules: [
          { name: '/repo/packages/ui/src/Button.stories.tsx' },
          { name: '/repo/packages/ui/src/Button.tsx' },
        ],
        reasons: [{ moduleName: './storybook-stories.js' }],
      },
    ],
  };

  it('keys the story by its root file, stripping the concatenation suffix', async () => {
    fileHashesRef.current = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B',
    };
    const manifest = await buildManifest(concatenatedStory, projectRoot, outOfGraph);

    expect([...manifest.storyFileHashes.keys()]).toEqual(['./src/Button.stories.tsx']);
  });

  it('records each concatenated sub-file as a dependency of the root file', async () => {
    fileHashesRef.current = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B',
    };
    const manifest = await buildManifest(concatenatedStory, projectRoot, outOfGraph);

    expect([...(manifest.files.get('./src/Button.stories.tsx')?.dependencies ?? [])]).toContain(
      './src/Button.tsx'
    );
  });

  it('changes the story hash when a concatenated sub-file content changes', async () => {
    fileHashesRef.current = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B1',
    };
    const before = await buildManifest(concatenatedStory, projectRoot, outOfGraph);

    fileHashesRef.current = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B2',
    };
    const after = await buildManifest(concatenatedStory, projectRoot, outOfGraph);

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
  });

  // `storybook-builder-rsbuild` 3.3.0/3.3.1 fill `modules` with the record's require-contexts rather
  // than its concatenated files, and omit the root file. Reading the root from `modules` then yields
  // a glob, which has no file on disk, so the whole record is promoted to a story importer and every
  // module that imports it becomes a story file.
  const contextsInModules: Stats = {
    modules: [
      {
        id: 1,
        name: './node_modules/storybook/dist/csf/index.js + 11 modules',
        modules: [{ name: './node_modules/storybook/dist/csf/*.js' }],
        reasons: [{ moduleName: './storybook-config-entry.js' }],
      },
      {
        id: 2,
        name: './node_modules/storybook/dist/instrumenter/index.js',
        reasons: [{ moduleName: './node_modules/storybook/dist/csf/index.js + 11 modules' }],
      },
    ],
  };

  it('roots a module at its own name when `modules` holds contexts rather than concatenated files', async () => {
    // The glob has no file on disk, which is what would promote the record to a story importer if
    // the root were read from `modules`.
    const spy = mockStatSync((candidate) => !candidate.includes('*.js'));

    try {
      fileHashesRef.current = {
        '/repo/packages/ui/node_modules/storybook/dist/csf/index.js': 'C',
        '/repo/packages/ui/node_modules/storybook/dist/instrumenter/index.js': 'I',
      };

      const manifest = await buildManifest(contextsInModules, projectRoot, outOfGraph);

      // The record keys by its own name, so it stays a real file rather than becoming a story
      // importer, and the module it imports is not a story file.
      expect(manifest.files.has('./node_modules/storybook/dist/csf/index.js')).toBe(true);
      expect([...manifest.storyFileHashes.keys()]).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('buildManifest unhashable paths', () => {
  it('skips a module named after a directory rather than failing the build', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    // rspack names one record after a directory on `storybook-builder-rsbuild` 3.3.0/3.3.1. Reading
    // it throws EISDIR, which would fail the whole manifest to an internalError bail.
    const directory = '/repo/packages/ui/node_modules/@storybook/react/dist/';

    fileHashesRef.current = { [story]: 'S' };
    const manifest = await buildManifest(
      {
        modules: [
          { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: story, modules: [{ name: directory }], reasons: [] },
        ],
      },
      projectRoot,
      outOfGraph
    );

    expect([...manifest.storyFileHashes.keys()]).toEqual(['./src/Button.stories.tsx']);
    expect(manifest.files.has('./node_modules/@storybook/react/dist')).toBe(false);
  });
});

describe('buildManifest suffix-equivalent story importer identity', () => {
  it('serializes the same manifest when only the story-entry reason gains a concatenation suffix', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const stats = (storyImporter: string): Stats => ({
      modules: [{ id: 1, name: story, reasons: [{ moduleName: storyImporter }] }],
    });
    fileHashesRef.current = { [story]: 'S' };

    const plain = serializeManifest(
      await buildManifest(stats('./storybook-stories.js'), projectRoot, outOfGraph)
    );
    const concatenated = serializeManifest(
      await buildManifest(stats('./storybook-stories.js + 1 modules'), projectRoot, outOfGraph)
    );

    expect(concatenated).toEqual(plain);
  });
});

describe('buildManifest concatenated modules with rspack-style child names', () => {
  // rspack labels a concatenated child's `name` with the parent group name (e.g.
  // `./Button.stories.tsx + 1 modules`) rather than the child's own file. The real path is only in
  // `nameForCondition`. Without reading `nameForCondition` the child collapses onto the root file
  // and its content is never hashed.
  const rspackConcatenatedStory: Stats = {
    modules: [
      {
        id: 1,
        name: '/repo/packages/ui/src/Button.stories.tsx + 1 modules',
        nameForCondition: '/repo/packages/ui/src/Button.stories.tsx',
        modules: [
          {
            name: '/repo/packages/ui/src/Button.stories.tsx',
            nameForCondition: '/repo/packages/ui/src/Button.stories.tsx',
          },
          {
            // The buggy child: `name` is the group label, real file is in nameForCondition.
            name: '/repo/packages/ui/src/Button.stories.tsx + 1 modules',
            nameForCondition: '/repo/packages/ui/src/Button.tsx',
          },
        ],
        reasons: [{ moduleName: './storybook-stories.js' }],
      },
    ],
  };

  it('recovers the concatenated child file from nameForCondition', async () => {
    fileHashesRef.current = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B',
    };
    const manifest = await buildManifest(rspackConcatenatedStory, projectRoot, outOfGraph);

    expect([...manifest.storyFileHashes.keys()]).toEqual(['./src/Button.stories.tsx']);
    expect([...(manifest.files.get('./src/Button.stories.tsx')?.dependencies ?? [])]).toContain(
      './src/Button.tsx'
    );
  });

  it('changes the story hash when the concatenated child content changes', async () => {
    fileHashesRef.current = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B1',
    };
    const before = await buildManifest(rspackConcatenatedStory, projectRoot, outOfGraph);

    fileHashesRef.current = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B2',
    };
    const after = await buildManifest(rspackConcatenatedStory, projectRoot, outOfGraph);

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
  });

  it('publishes the same manifest when minimal stats re-emit concatenated files by usable name', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const implementation = '/repo/packages/ui/src/Button.tsx';
    const shimmedStats: Stats = {
      modules: [
        {
          id: 1,
          name: story,
          reasons: [{ moduleName: './storybook-stories.js' }],
        },
        {
          id: 2,
          name: implementation,
          reasons: [{ moduleName: story }],
        },
      ],
    };
    fileHashesRef.current = { [story]: 'S', [implementation]: 'B' };

    const full = serializeManifest(
      await buildManifest(rspackConcatenatedStory, projectRoot, outOfGraph)
    );
    const shimmed = serializeManifest(await buildManifest(shimmedStats, projectRoot, outOfGraph));

    expect(shimmed).toEqual(full);
  });
});

describe('buildManifest missing names', () => {
  it('skips reasons with a null moduleName without dropping the story', async () => {
    const stats: Stats = {
      modules: [
        {
          id: 1,
          name: '/repo/packages/ui/src/Button.stories.tsx',
          // An entry reason carries `moduleName: null`; the stories-entry reason must still apply.
          reasons: [
            { moduleName: null as unknown as string },
            { moduleName: './storybook-stories.js' },
          ],
        },
      ],
    };
    fileHashesRef.current = { '/repo/packages/ui/src/Button.stories.tsx': 'S' };

    const manifest = await buildManifest(stats, projectRoot, outOfGraph);

    expect([...manifest.storyFileHashes.keys()]).toEqual(['./src/Button.stories.tsx']);
  });

  it('uses module.modules when module.name is absent', async () => {
    const stats: Stats = {
      modules: [
        {
          id: 1,
          name: null as unknown as string,
          modules: [
            { name: '/repo/packages/ui/src/Button.stories.tsx' },
            { name: '/repo/packages/ui/src/Button.tsx' },
          ],
          reasons: [{ moduleName: './storybook-stories.js' }],
        },
      ],
    };
    fileHashesRef.current = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B',
    };

    const manifest = await buildManifest(stats, projectRoot, outOfGraph);

    expect([...manifest.storyFileHashes.keys()]).toEqual(['./src/Button.stories.tsx']);
    expect([...(manifest.files.get('./src/Button.stories.tsx')?.dependencies ?? [])]).toContain(
      './src/Button.tsx'
    );
  });
});

describe('buildManifest hashFiles skip branches', () => {
  it('contributes the empty string to a story hash for a file missing on disk', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const missing = '/repo/packages/ui/src/missing.ts';

    // Scoped override: the shared `fs` mock reads every path as a file, so override it just for
    // this test to make `missing` appear absent from disk, then restore it.
    const existsSyncSpy = mockStatSync((candidate) => candidate !== missing);

    try {
      const stats: Stats = {
        modules: [
          { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: missing, reasons: [{ moduleName: story }] },
        ],
      };

      fileHashesRef.current = { [story]: 'S', [missing]: 'WOULD-BE-A' };
      const before = await buildManifest(stats, projectRoot, outOfGraph);

      // Change the content hash the missing file *would* have if it were hashed. If the skip
      // branch didn't treat it as contributing '', this toggle would change the story hash.
      fileHashesRef.current = { [story]: 'S', [missing]: 'WOULD-BE-B' };
      const after = await buildManifest(stats, projectRoot, outOfGraph);

      expect(after.storyFileHashes.get('./src/Button.stories.tsx')).toBe(
        before.storyFileHashes.get('./src/Button.stories.tsx')
      );
    } finally {
      existsSyncSpy.mockRestore();
    }
  });
});
