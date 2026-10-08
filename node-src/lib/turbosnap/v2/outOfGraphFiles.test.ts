/* eslint-disable max-lines */
import { describe, expect, it, vi } from 'vitest';

import TestLogger from '../../testLogger';
import {
  hashOutOfGraphFiles,
  MissingStorybookConfigError,
  OutOfGraphInput,
  rollUpOutOfGraphFiles,
} from './outOfGraphFiles';
import { InMemoryDisk, inMemoryProjectFiles } from './projectFiles.fake';

const projectRoot = '/repo/packages/ui';
const h64ToString = (value: string) => `h(${value})`;

// The sweep's input over a disk supplied per test: the tree it walks and the content hash of each
// file. What the disk *means* — symlinks, cycles, absent and unreadable directories — belongs to the
// adapter and is pinned against real temporary directories in projectFiles.test.ts, so these tests
// describe only which files each section claims. The adapter reads the disk live, so a test that
// mutates its disk between two sweeps reuses the same input.
function makeInput(disk: InMemoryDisk, overrides?: Partial<OutOfGraphInput>): OutOfGraphInput {
  return {
    log: new TestLogger(),
    projectRoot,
    gitRoot: '/repo',
    configDir: `${projectRoot}/.storybook`,
    staticDirs: [`${projectRoot}/.storybook/static`],
    externals: [],
    projectFiles: inMemoryProjectFiles(disk),
    ...overrides,
  };
}

async function sweep(input: OutOfGraphInput) {
  const { outOfGraphFiles } = await hashOutOfGraphFiles(input);
  return outOfGraphFiles;
}

async function rollUp(input: OutOfGraphInput) {
  return rollUpOutOfGraphFiles(await sweep(input), h64ToString);
}

describe('hashOutOfGraphFiles', () => {
  it('hashes every config file recursively, keyed by canonical git-root-relative path', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts', 'preview.ts', 'nested'],
        '/repo/packages/ui/.storybook/nested': ['helper.ts'],
      },
    };

    const { storybookConfigFiles } = await sweep(makeInput(disk));

    expect([...storybookConfigFiles.keys()]).toEqual([
      './.storybook/main.ts',
      './.storybook/nested/helper.ts',
      './.storybook/preview.ts',
    ]);
  });

  it('hashes preview.* alongside the rest of the config dir, so its bytes are covered too', async () => {
    const disk: InMemoryDisk = {
      directories: { '/repo/packages/ui/.storybook': ['main.ts', 'preview.ts'] },
    };

    const { storybookConfigFiles } = await sweep(makeInput(disk));

    // The graph-rolled `.storybook/preview.ts` entry covers its *imports*; this covers its bytes,
    // which is what closes the empty-preview.ts case where the builder elides the module entirely.
    expect(storybookConfigFiles.has('./.storybook/preview.ts')).toBe(true);
  });

  it('gives static files their own section, and keeps them in the config sweep when nested in the config dir', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts', 'static'],
        '/repo/packages/ui/.storybook/static': ['mockServiceWorker.js'],
      },
    };

    const { storybookConfigFiles, staticFiles } = await sweep(makeInput(disk));

    expect([...storybookConfigFiles.keys()]).toEqual([
      './.storybook/main.ts',
      './.storybook/static/mockServiceWorker.js',
    ]);
    expect([...staticFiles.keys()]).toEqual(['./.storybook/static/mockServiceWorker.js']);
  });

  it('hashes a static entry that names a single file, which Storybook serves at its basename', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui': ['favicon.ico'],
        '/repo/packages/ui/.storybook': ['main.ts'],
      },
    };

    const { staticFiles } = await sweep(
      makeInput(disk, { staticDirs: [`${projectRoot}/favicon.ico`] })
    );

    expect([...staticFiles.keys()]).toEqual(['./favicon.ico']);
  });

  it('keeps config files in the config section when the config dir itself is a static dir', async () => {
    const disk: InMemoryDisk = {
      directories: { '/repo/packages/ui/.storybook': ['main.ts', 'preview.ts'] },
    };

    const { storybookConfigFiles, staticFiles } = await sweep(
      makeInput(disk, { staticDirs: [`${projectRoot}/.storybook`] })
    );

    expect([...storybookConfigFiles.keys()]).toEqual([
      './.storybook/main.ts',
      './.storybook/preview.ts',
    ]);
    expect([...staticFiles.keys()]).toEqual(['./.storybook/main.ts', './.storybook/preview.ts']);
  });

  it.each<[string, InMemoryDisk['directories']]>([
    ['is not on disk', {}],
    ['has no main config', { '/repo/packages/ui/.storybook': ['preview.ts'] }],
    [
      'only has a main config in a nested directory',
      {
        '/repo/packages/ui/.storybook': ['nested'],
        '/repo/packages/ui/.storybook/nested': ['main.ts'],
      },
    ],
  ])('refuses to sweep when the config dir %s', async (_, directories) => {
    // Storybook requires main.*, so a directory without one is not a config directory. Refusing here
    // is what guarantees the config section is never empty.
    await expect(hashOutOfGraphFiles(makeInput({ directories }))).rejects.toThrow(
      MissingStorybookConfigError
    );
  });

  it('skips documentation files anywhere in the config dir', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts', 'README.md', 'NOTES.TXT', 'nested'],
        '/repo/packages/ui/.storybook/nested': ['guide.md'],
      },
    };

    const { storybookConfigFiles } = await sweep(makeInput(disk));

    // Docs in the config dir shouldn't affect the built Storybook, so they stay out of the roll-up
    // hash.
    expect([...storybookConfigFiles.keys()]).toEqual(['./.storybook/main.ts']);
  });

  // This matches the behavior of v1 which only ignores docs in the config dir.
  it('keeps documentation files in a static dir', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts', 'static'],
        '/repo/packages/ui/.storybook/static': ['terms.md'],
      },
    };

    const { staticFiles } = await sweep(makeInput(disk));

    expect([...staticFiles.keys()]).toEqual(['./.storybook/static/terms.md']);
  });

  it('returns an empty static section when staticDirs is unset', async () => {
    const disk: InMemoryDisk = {
      directories: { '/repo/packages/ui/.storybook': ['main.ts'] },
    };

    const { staticFiles } = await sweep(makeInput(disk, { staticDirs: [] }));

    expect(staticFiles.size).toBe(0);
  });

  it('collects static files from every configured static directory', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts'],
        '/repo/packages/ui/public': ['logo.svg'],
        '/repo/packages/ui/assets': ['font.woff2'],
      },
    };

    const { staticFiles } = await sweep(
      makeInput(disk, { staticDirs: [`${projectRoot}/public`, `${projectRoot}/assets`] })
    );

    expect([...staticFiles.keys()]).toEqual(['./assets/font.woff2', './public/logo.svg']);
  });
});

describe('hashOutOfGraphFiles skipped files', () => {
  it('drops a static file git ignores and records it', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts'],
        '/repo/packages/ui/public': ['logo.svg', 'bundle.css'],
      },
      isIgnored: (candidate) => candidate.endsWith('bundle.css'),
    };

    const {
      outOfGraphFiles: { staticFiles },
      skippedFiles,
    } = await hashOutOfGraphFiles(makeInput(disk, { staticDirs: [`${projectRoot}/public`] }));

    expect([...staticFiles.keys()]).toEqual(['./public/logo.svg']);
    expect([...skippedFiles]).toEqual([['./public/bundle.css', 'gitignored']]);
  });

  it('hashes config files git ignores, since a generated preview still shapes every story', async () => {
    const disk: InMemoryDisk = {
      directories: { '/repo/packages/ui/.storybook': ['main.ts', 'preview.ts'] },
      isIgnored: (candidate) => candidate.endsWith('preview.ts'),
    };

    const {
      outOfGraphFiles: { storybookConfigFiles },
      skippedFiles,
    } = await hashOutOfGraphFiles(makeInput(disk));

    expect([...storybookConfigFiles.keys()]).toEqual([
      './.storybook/main.ts',
      './.storybook/preview.ts',
    ]);
    expect(skippedFiles.size).toBe(0);
  });

  it('builds when git ignores the main config, because the config dir is hashed regardless', async () => {
    const disk: InMemoryDisk = {
      directories: { '/repo/packages/ui/.storybook': ['main.ts'] },
      isIgnored: (candidate) => candidate.endsWith('main.ts'),
    };

    const { storybookConfigFiles } = await sweep(makeInput(disk));

    expect([...storybookConfigFiles.keys()]).toEqual(['./.storybook/main.ts']);
  });

  it('hashes an ignored file in a static dir inside the config dir, since the config dir is never skipped', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts', 'static'],
        '/repo/packages/ui/.storybook/static': ['bundle.css'],
      },
      isIgnored: (candidate) => candidate.endsWith('bundle.css'),
    };

    const {
      outOfGraphFiles: { storybookConfigFiles, staticFiles },
      skippedFiles,
    } = await hashOutOfGraphFiles(makeInput(disk));

    expect([...storybookConfigFiles.keys()]).toEqual([
      './.storybook/main.ts',
      './.storybook/static/bundle.css',
    ]);
    expect([...staticFiles.keys()]).toEqual(['./.storybook/static/bundle.css']);
    expect(skippedFiles.size).toBe(0);
  });
});

describe('hashOutOfGraphFiles externals', () => {
  // Globs are the user's `--externals`, which v1 matches against git-root-relative changed files, so
  // the same spelling has to match here against the same universe: the git index.
  const disk: InMemoryDisk = {
    directories: { '/repo/packages/ui/.storybook': ['main.ts'] },
    trackedFiles: [
      '/repo/tailwind.config.js',
      '/repo/packages/ui/tailwind.config.js',
      '/repo/packages/ui/src/styles/main.scss',
      '/repo/packages/ui/src/Button.tsx',
    ],
  };

  it('hashes the tracked files matching a glob, keyed by canonical project-relative path', async () => {
    const { externals } = await sweep(
      makeInput(disk, { externals: ['**/*.scss', 'packages/ui/tailwind.config.js'] })
    );

    expect([...externals.keys()]).toEqual(['./src/styles/main.scss', './tailwind.config.js']);
  });

  it('matches globs against git-root-relative paths, so a file above the project is reachable', async () => {
    const { externals } = await sweep(makeInput(disk, { externals: ['tailwind.config.js'] }));

    expect([...externals.keys()]).toEqual(['../../tailwind.config.js']);
  });

  it('is empty when no externals are configured, without reading the git index', async () => {
    const projectFiles = inMemoryProjectFiles(disk);
    const trackedFiles = vi.spyOn(projectFiles, 'trackedFiles');

    const { externals } = await sweep(makeInput(disk, { projectFiles }));

    expect(externals.size).toBe(0);
    expect(trackedFiles).not.toHaveBeenCalled();
  });

  it('skips an indexed path with no file on disk, such as a deleted file or a submodule root', async () => {
    const { externals } = await sweep(
      makeInput(
        { ...disk, isAbsent: (candidate) => candidate.endsWith('main.scss') },
        { externals: ['**/*.scss', 'packages/ui/tailwind.config.js'] }
      )
    );

    expect([...externals.keys()]).toEqual(['./tailwind.config.js']);
  });
});

describe('rollUpOutOfGraphFiles', () => {
  it('rolls each section into its own synthetic entry', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts', 'static'],
        '/repo/packages/ui/.storybook/static': ['logo.svg'],
      },
      trackedFiles: ['/repo/tailwind.config.js'],
    };

    const rollUps = await rollUp(makeInput(disk, { externals: ['tailwind.config.js'] }));

    expect([...rollUps.keys()]).toEqual(['storybookConfigFiles', 'staticFiles', 'externals']);
  });

  it('contributes no externals entry when the globs match nothing, so a project without externals is unchanged', async () => {
    const disk: InMemoryDisk = { directories: { '/repo/packages/ui/.storybook': ['main.ts'] } };

    const rollUps = await rollUp(makeInput(disk, { externals: ['tailwind.config.js'] }));

    expect([...rollUps.keys()]).toEqual(['storybookConfigFiles']);
  });

  it('moves the externals roll-up when an external file content changes, leaving the others alone', async () => {
    const external = '/repo/tailwind.config.js';
    const disk: InMemoryDisk = {
      directories: { '/repo/packages/ui/.storybook': ['main.ts'] },
      trackedFiles: [external],
      fileHashes: { [external]: 'T1' },
    };
    const input = makeInput(disk, { externals: ['tailwind.config.js'] });
    const before = await rollUp(input);

    disk.fileHashes = { [external]: 'T2' };
    const after = await rollUp(input);

    expect(after.get('externals')).not.toBe(before.get('externals'));
    expect(after.get('storybookConfigFiles')).toBe(before.get('storybookConfigFiles'));
  });

  it('moves the externals roll-up when an external is renamed without changing its bytes', async () => {
    const disk: InMemoryDisk = {
      directories: { '/repo/packages/ui/.storybook': ['main.ts'] },
      trackedFiles: ['/repo/tailwind.config.js'],
      fileHashes: { '/repo/tailwind.config.js': 'T' },
    };
    const input = makeInput(disk, { externals: ['*.config.js'] });
    const before = await rollUp(input);

    // Same bytes under a different name is a different file to the tooling that reads it by name, so
    // path identity is hashed here as it is for the other sections.
    disk.trackedFiles = ['/repo/postcss.config.js'];
    disk.fileHashes = { '/repo/postcss.config.js': 'T' };
    const after = await rollUp(input);

    expect(after.get('externals')).not.toBe(before.get('externals'));
  });

  it('moves the externals roll-up when another tracked file starts matching, leaving the others alone', async () => {
    const disk: InMemoryDisk = {
      directories: { '/repo/packages/ui/.storybook': ['main.ts'] },
      trackedFiles: ['/repo/tailwind.config.js'],
      fileHashes: { '/repo/tailwind.config.js': 'T' },
    };
    const input = makeInput(disk, { externals: ['*.config.js'] });
    const before = await rollUp(input);

    disk.trackedFiles = ['/repo/tailwind.config.js', '/repo/postcss.config.js'];
    disk.fileHashes = { '/repo/tailwind.config.js': 'T', '/repo/postcss.config.js': 'P' };
    const after = await rollUp(input);

    expect(after.get('externals')).not.toBe(before.get('externals'));
    expect(after.get('storybookConfigFiles')).toBe(before.get('storybookConfigFiles'));
  });

  it('moves the config roll-up when a config file content changes', async () => {
    const disk: InMemoryDisk = {
      directories: { '/repo/packages/ui/.storybook': ['main.ts'] },
      fileHashes: { '/repo/packages/ui/.storybook/main.ts': 'M1' },
    };
    const input = makeInput(disk);
    const before = await rollUp(input);

    disk.fileHashes = { '/repo/packages/ui/.storybook/main.ts': 'M2' };
    const after = await rollUp(input);

    expect(after.get('storybookConfigFiles')).not.toBe(before.get('storybookConfigFiles'));
  });

  it('moves the static roll-up when a static file content changes, leaving the config roll-up alone', async () => {
    const staticFile = '/repo/packages/ui/public/logo.svg';
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts'],
        '/repo/packages/ui/public': ['logo.svg'],
      },
      fileHashes: { '/repo/packages/ui/.storybook/main.ts': 'M', [staticFile]: 'A1' },
    };
    const input = makeInput(disk, { staticDirs: [`${projectRoot}/public`] });
    const before = await rollUp(input);

    disk.fileHashes = { '/repo/packages/ui/.storybook/main.ts': 'M', [staticFile]: 'A2' };
    const after = await rollUp(input);

    expect(after.get('staticFiles')).not.toBe(before.get('staticFiles'));
    expect(after.get('storybookConfigFiles')).toBe(before.get('storybookConfigFiles'));
  });

  it('moves the static roll-up when an asset is renamed without changing its bytes', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts', 'static'],
        '/repo/packages/ui/.storybook/static': ['logo.svg'],
      },
      fileHashes: { '/repo/packages/ui/.storybook/static/logo.svg': 'A' },
    };
    const input = makeInput(disk);
    const before = await rollUp(input);

    // Same bytes at a different URL renders differently, so the multiset of contents isn't enough.
    disk.directories = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['brand.svg'],
    };
    disk.fileHashes = { '/repo/packages/ui/.storybook/static/brand.svg': 'A' };
    const after = await rollUp(input);

    expect(after.get('staticFiles')).not.toBe(before.get('staticFiles'));
  });

  it('moves the static roll-up when two assets swap contents', async () => {
    const [a, b] = [
      '/repo/packages/ui/.storybook/static/a.png',
      '/repo/packages/ui/.storybook/static/b.png',
    ];
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts', 'static'],
        '/repo/packages/ui/.storybook/static': ['a.png', 'b.png'],
      },
      fileHashes: { [a]: 'A', [b]: 'B' },
    };
    const input = makeInput(disk);
    const before = await rollUp(input);

    // The multiset of contents is identical, but each URL now serves the other's bytes.
    disk.fileHashes = { [a]: 'B', [b]: 'A' };
    const after = await rollUp(input);

    expect(after.get('staticFiles')).not.toBe(before.get('staticFiles'));
  });

  it('moves the config roll-up when a config file is renamed without changing its bytes', async () => {
    const disk: InMemoryDisk = {
      directories: { '/repo/packages/ui/.storybook': ['main.ts', 'preview-head.html'] },
      fileHashes: {
        '/repo/packages/ui/.storybook/main.ts': 'M',
        '/repo/packages/ui/.storybook/preview-head.html': 'H',
      },
    };
    const input = makeInput(disk);
    const before = await rollUp(input);

    // Storybook loads config files by name, so the same bytes under a new name inject elsewhere.
    disk.directories = { '/repo/packages/ui/.storybook': ['main.ts', 'preview-body.html'] };
    disk.fileHashes = {
      '/repo/packages/ui/.storybook/main.ts': 'M',
      '/repo/packages/ui/.storybook/preview-body.html': 'H',
    };
    const after = await rollUp(input);

    expect(after.get('storybookConfigFiles')).not.toBe(before.get('storybookConfigFiles'));
  });

  it('omits a section that has no files, matching how the globals roll-up behaves', async () => {
    const disk: InMemoryDisk = {
      directories: { '/repo/packages/ui/.storybook': ['main.ts'] },
    };

    const rollUps = await rollUp(makeInput(disk));

    expect(rollUps.has('staticFiles')).toBe(false);
  });

  it('keeps both roll-ups stable when the project moves, since path identity is project-relative', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts', 'static'],
        '/repo/packages/ui/.storybook/static': ['logo.svg'],
      },
      fileHashes: {
        '/repo/packages/ui/.storybook/main.ts': 'M',
        '/repo/packages/ui/.storybook/static/logo.svg': 'A',
      },
    };
    const before = await rollUp(makeInput(disk));

    // The project moved, so its absolute directories moved with it.
    const movedRoot = '/repo/apps/web';
    disk.directories = {
      '/repo/apps/web/.storybook': ['main.ts', 'static'],
      '/repo/apps/web/.storybook/static': ['logo.svg'],
    };
    disk.fileHashes = {
      '/repo/apps/web/.storybook/main.ts': 'M',
      '/repo/apps/web/.storybook/static/logo.svg': 'A',
    };
    const after = await rollUp(
      makeInput(disk, {
        projectRoot: movedRoot,
        configDir: `${movedRoot}/.storybook`,
        staticDirs: [`${movedRoot}/.storybook/static`],
      })
    );

    expect(after.get('storybookConfigFiles')).toBe(before.get('storybookConfigFiles'));
    expect(after.get('staticFiles')).toBe(before.get('staticFiles'));
  });
});
