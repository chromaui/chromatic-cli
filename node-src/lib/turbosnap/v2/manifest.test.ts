import * as fs from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Stats } from '../../../types';
import { buildManifest } from './manifest';

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: () => true,
  writeFileSync: vi.fn(),
}));

// A hoisted ref so tests can control the content hash returned for each absolute file path.
// getFileHashes is called with absolute paths and returns hashes keyed by those paths.
const { fileHashesRef } = vi.hoisted(() => ({
  fileHashesRef: { current: {} as Record<string, string> },
}));

vi.mock('../../../lib/getFileHashes', () => ({
  getFileHashes: (files: string[]) =>
    Promise.resolve(Object.fromEntries(files.map((f) => [f, fileHashesRef.current[f] ?? 'x']))),
}));

const projectRoot = '/repo/packages/ui';

beforeEach(() => {
  fileHashesRef.current = {};
});

describe('buildManifest', () => {
  it('keys story files by their canonical project-relative path', async () => {
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

    const manifest = await buildManifest(stats, projectRoot);

    expect([...manifest.storyFileHashes.keys()]).toEqual(['src/Button.stories.tsx']);
    expect(manifest.files.has('src/Button.stories.tsx')).toBe(true);
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
    const before = await buildManifest(stats, projectRoot);

    fileHashesRef.current = { [story]: 'S', [leaf]: 'T2' };
    const after = await buildManifest(stats, projectRoot);

    expect(after.storyFileHashes.get('src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('src/Button.stories.tsx')
    );
  });
});

describe('buildManifest relocation stability', () => {
  it('produces identical story keys and hashes when the whole project moves', async () => {
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
        '/repo/packages/ui'
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
        '/repo/apps/web/ui'
      );
    })();

    expect([...after.storyFileHashes.entries()]).toEqual([...before.storyFileHashes.entries()]);
    expect(after.storybookHash).toBe(before.storybookHash);
  });

  it('keeps a story hash stable when a dependency moves and reorders its siblings', async () => {
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
      projectRoot
    );

    // Build 2: a.ts moved to z.ts (content unchanged), so paths now sort as [Button, b, z].
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
      projectRoot
    );

    expect(after.storyFileHashes.get('src/Button.stories.tsx')).toBe(
      before.storyFileHashes.get('src/Button.stories.tsx')
    );
  });

  it('keeps a story hash stable when an external dependency relocates further from the project', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';

    // Build 1: theme.ts lives one level above the project, in a sibling package.
    // It normalizes to '../shared/theme.ts' relative to projectRoot.
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
      projectRoot
    );

    // Build 2: the repo is restructured so theme.ts now lives two levels above the project
    // ('../../shared/theme.ts'), but its content is unchanged. The story and its internal
    // dependencies don't move.
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
      projectRoot
    );

    expect(after.storyFileHashes.get('src/Button.stories.tsx')).toBe(
      before.storyFileHashes.get('src/Button.stories.tsx')
    );
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

    const first = await buildManifest(forwards, projectRoot);
    const second = await buildManifest(backwards, projectRoot);

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
    const manifest = await buildManifest(concatenatedStory, projectRoot);

    expect([...manifest.storyFileHashes.keys()]).toEqual(['src/Button.stories.tsx']);
  });

  it('records each concatenated sub-file as a dependency of the root file', async () => {
    fileHashesRef.current = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B',
    };
    const manifest = await buildManifest(concatenatedStory, projectRoot);

    expect([...(manifest.files.get('src/Button.stories.tsx')?.dependencies ?? [])]).toContain(
      'src/Button.tsx'
    );
  });

  it('changes the story hash when a concatenated sub-file content changes', async () => {
    fileHashesRef.current = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B1',
    };
    const before = await buildManifest(concatenatedStory, projectRoot);

    fileHashesRef.current = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/Button.tsx': 'B2',
    };
    const after = await buildManifest(concatenatedStory, projectRoot);

    expect(after.storyFileHashes.get('src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('src/Button.stories.tsx')
    );
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

    const manifest = await buildManifest(stats, projectRoot);

    expect([...manifest.storyFileHashes.keys()]).toEqual(['src/Button.stories.tsx']);
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

    const manifest = await buildManifest(stats, projectRoot);

    expect([...manifest.storyFileHashes.keys()]).toEqual(['src/Button.stories.tsx']);
    expect([...(manifest.files.get('src/Button.stories.tsx')?.dependencies ?? [])]).toContain(
      'src/Button.tsx'
    );
  });
});

// The require-context glob is not a file on disk; everything else is. Spy on the shared `fs` mock
// (which hardcodes `existsSync: () => true`) so the glob module appears absent, then restore it.
function withGlobAbsent(run: () => Promise<void>) {
  const spy = vi
    .spyOn(fs, 'existsSync')
    .mockImplementation((candidate) => !String(candidate).includes('lazy'));
  return run().finally(() => spy.mockRestore());
}

describe('buildManifest story detection through a require-context', () => {
  // Webpack/rspack don't import story files directly from the entry: the entry imports a lazy
  // require-context (a glob module that is not a real file), and that context imports the stories.
  const glob = './src/lib/ lazy namespace object';
  const story = '/repo/packages/ui/src/lib/Button.stories.tsx';

  const stats: Stats = {
    modules: [
      { id: 1, name: glob, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: story, reasons: [{ moduleName: glob }] },
    ],
  };

  it('detects stories imported via a lazy require-context imported by the entry', async () => {
    await withGlobAbsent(async () => {
      fileHashesRef.current = { [story]: 'S' };
      const manifest = await buildManifest(stats, projectRoot);
      expect([...manifest.storyFileHashes.keys()]).toEqual(['src/lib/Button.stories.tsx']);
    });
  });

  it('excludes the require-context glob (no file on disk) from the files map', async () => {
    await withGlobAbsent(async () => {
      fileHashesRef.current = { [story]: 'S' };
      const manifest = await buildManifest(stats, projectRoot);
      expect([...manifest.files.keys()].some((key) => key.includes('lazy'))).toBe(false);
      expect(manifest.files.has('src/lib/Button.stories.tsx')).toBe(true);
    });
  });

  it('does not treat the require-context glob itself as a story file', async () => {
    await withGlobAbsent(async () => {
      fileHashesRef.current = { [story]: 'S' };
      const manifest = await buildManifest(stats, projectRoot);
      const keys = [...manifest.storyFileHashes.keys()];
      expect(keys.some((key) => key.includes('lazy'))).toBe(false);
    });
  });
});

describe('buildManifest story detection through a config-entry require-context', () => {
  // rsbuild imports the require-context from the config entry (not storybook-stories.js), and the
  // stories themselves are concatenated modules.
  const glob = './src/lib|lazy|namespace object';
  const configEntry = './node_modules/.cache/storybook-rsbuild-builder/storybook-config-entry.js';
  const story = '/repo/packages/ui/src/lib/Button.stories.tsx';
  const impl = '/repo/packages/ui/src/lib/Button.tsx';

  const stats: Stats = {
    modules: [
      { id: 1, name: glob, reasons: [{ moduleName: `${configEntry} + 1 modules` }] },
      {
        id: 2,
        name: `${story} + 1 modules`,
        modules: [{ name: story }, { name: impl }],
        reasons: [{ moduleName: glob }],
      },
      // A real file the config entry imports directly (like `.storybook/preview.ts`); it must not
      // be mistaken for a story just because the config entry imports it.
      {
        id: 3,
        name: '/repo/packages/ui/.storybook/preview.ts',
        reasons: [{ moduleName: `${configEntry} + 1 modules` }],
      },
    ],
  };

  it('detects a concatenated story imported via a context imported by the config entry', async () => {
    await withGlobAbsent(async () => {
      fileHashesRef.current = { [story]: 'S', [impl]: 'B' };
      const manifest = await buildManifest(stats, projectRoot);
      expect([...manifest.storyFileHashes.keys()]).toEqual(['src/lib/Button.stories.tsx']);
    });
  });

  it('does not treat a real file imported directly by the config entry as a story', async () => {
    await withGlobAbsent(async () => {
      fileHashesRef.current = { [story]: 'S', [impl]: 'B' };
      const manifest = await buildManifest(stats, projectRoot);
      expect([...manifest.storyFileHashes.keys()]).not.toContain('.storybook/preview.ts');
    });
  });
});

describe('buildManifest hashFiles skip branches', () => {
  it('contributes the empty string to a story hash for a file missing on disk', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const missing = '/repo/packages/ui/src/missing.ts';

    // Scoped override: the shared `fs` mock hardcodes `existsSync: () => true`, so spy on it just
    // for this test to make `missing` appear absent from disk, then restore it.
    const existsSyncSpy = vi
      .spyOn(fs, 'existsSync')
      .mockImplementation((candidate) => candidate !== missing);

    try {
      const stats: Stats = {
        modules: [
          { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: missing, reasons: [{ moduleName: story }] },
        ],
      };

      fileHashesRef.current = { [story]: 'S', [missing]: 'WOULD-BE-A' };
      const before = await buildManifest(stats, projectRoot);

      // Change the content hash the missing file *would* have if it were hashed. If the skip
      // branch didn't treat it as contributing '', this toggle would change the story hash.
      fileHashesRef.current = { [story]: 'S', [missing]: 'WOULD-BE-B' };
      const after = await buildManifest(stats, projectRoot);

      expect(after.storyFileHashes.get('src/Button.stories.tsx')).toBe(
        before.storyFileHashes.get('src/Button.stories.tsx')
      );
    } finally {
      existsSyncSpy.mockRestore();
    }
  });
});
