import { describe, expect, it } from 'vitest';

import { hashOutOfGraphFiles, OutOfGraphInput, rollUpOutOfGraphFiles } from './outOfGraphFiles';
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
    configDir: `${projectRoot}/.storybook`,
    staticDirs: [`${projectRoot}/.storybook/static`],
    projectFiles: inMemoryProjectFiles(disk),
    ...overrides,
  };
}

async function rollUp(input: OutOfGraphInput, theProjectRoot = projectRoot) {
  return rollUpOutOfGraphFiles(await hashOutOfGraphFiles(input, theProjectRoot), h64ToString);
}

describe('hashOutOfGraphFiles', () => {
  it('hashes every config file recursively, keyed by canonical git-root-relative path', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts', 'preview.ts', 'nested'],
        '/repo/packages/ui/.storybook/nested': ['helper.ts'],
      },
    };

    const { storybookConfigFiles } = await hashOutOfGraphFiles(makeInput(disk), projectRoot);

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

    const { storybookConfigFiles } = await hashOutOfGraphFiles(makeInput(disk), projectRoot);

    // The graph-rolled `.storybook/preview.ts` entry covers its *imports*; this covers its bytes,
    // which is what closes the empty-preview.ts case where the builder elides the module entirely.
    expect(storybookConfigFiles.has('./.storybook/preview.ts')).toBe(true);
  });

  it('gives static files their own section, excluding them from the config sweep', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts', 'static'],
        '/repo/packages/ui/.storybook/static': ['mockServiceWorker.js'],
      },
    };

    const { storybookConfigFiles, staticFiles } = await hashOutOfGraphFiles(
      makeInput(disk),
      projectRoot
    );

    // Static wins over the config dir, mirroring v1 testing isStaticFile before isStorybookFile.
    expect([...storybookConfigFiles.keys()]).toEqual(['./.storybook/main.ts']);
    expect([...staticFiles.keys()]).toEqual(['./.storybook/static/mockServiceWorker.js']);
  });

  it('returns an empty static section when staticDirs is unset', async () => {
    const disk: InMemoryDisk = {
      directories: { '/repo/packages/ui/.storybook': ['main.ts'] },
    };

    const { staticFiles } = await hashOutOfGraphFiles(
      makeInput(disk, { staticDirs: [] }),
      projectRoot
    );

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

    const { staticFiles } = await hashOutOfGraphFiles(
      makeInput(disk, { staticDirs: [`${projectRoot}/public`, `${projectRoot}/assets`] }),
      projectRoot
    );

    expect([...staticFiles.keys()]).toEqual(['./assets/font.woff2', './public/logo.svg']);
  });
});

describe('rollUpOutOfGraphFiles', () => {
  it('rolls each section into its own synthetic entry', async () => {
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts', 'static'],
        '/repo/packages/ui/.storybook/static': ['logo.svg'],
      },
    };

    const rollUps = await rollUp(makeInput(disk));

    expect([...rollUps.keys()]).toEqual(['storybookConfigFiles', 'staticFiles']);
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
    const staticFile = '/repo/packages/ui/.storybook/static/logo.svg';
    const disk: InMemoryDisk = {
      directories: {
        '/repo/packages/ui/.storybook': ['main.ts', 'static'],
        '/repo/packages/ui/.storybook/static': ['logo.svg'],
      },
      fileHashes: { '/repo/packages/ui/.storybook/main.ts': 'M', [staticFile]: 'A1' },
    };
    const input = makeInput(disk);
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
      directories: { '/repo/packages/ui/.storybook': ['preview-head.html'] },
      fileHashes: { '/repo/packages/ui/.storybook/preview-head.html': 'H' },
    };
    const input = makeInput(disk);
    const before = await rollUp(input);

    // Storybook loads config files by name, so the same bytes under a new name inject elsewhere.
    disk.directories = { '/repo/packages/ui/.storybook': ['preview-body.html'] };
    disk.fileHashes = { '/repo/packages/ui/.storybook/preview-body.html': 'H' };
    const after = await rollUp(input);

    expect(after.get('storybookConfigFiles')).not.toBe(before.get('storybookConfigFiles'));
  });

  it('omits a section that has no files, matching how the globals catch-all behaves', async () => {
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
        configDir: `${movedRoot}/.storybook`,
        staticDirs: [`${movedRoot}/.storybook/static`],
      }),
      movedRoot
    );

    expect(after.get('storybookConfigFiles')).toBe(before.get('storybookConfigFiles'));
    expect(after.get('staticFiles')).toBe(before.get('staticFiles'));
  });
});
