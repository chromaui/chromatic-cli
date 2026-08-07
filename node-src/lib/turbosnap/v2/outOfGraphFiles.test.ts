import { beforeEach, describe, expect, it } from 'vitest';

import { hashOutOfGraphFiles, OutOfGraphInput, rollUpOutOfGraphFiles } from './outOfGraphFiles';
import { InMemoryDiskReference, inMemoryProjectFiles } from './projectFiles';

// The sweep's disk: the tree it walks and the content hash of each file. What the disk *means* —
// symlinks, cycles, absent and unreadable directories — belongs to the adapter and is pinned against
// real temporary directories in projectFiles.test.ts, so these tests describe only which files each
// section claims.
const disk: InMemoryDiskReference = { current: {} };

const projectRoot = '/repo/packages/ui';
const input = {
  configDir: '.storybook',
  staticDirs: ['.storybook/static'],
  projectFiles: inMemoryProjectFiles(disk),
};

const h64ToString = (value: string) => `h(${value})`;

beforeEach(() => {
  disk.current = {};
});

describe('hashOutOfGraphFiles', () => {
  it('hashes every config file recursively, keyed by canonical git-root-relative path', async () => {
    disk.current.directories = {
      '/repo/packages/ui/.storybook': ['main.ts', 'preview.ts', 'nested'],
      '/repo/packages/ui/.storybook/nested': ['helper.ts'],
    };

    const { storybookConfigFiles } = await hashOutOfGraphFiles(input, projectRoot);

    expect([...storybookConfigFiles.keys()]).toEqual([
      './.storybook/main.ts',
      './.storybook/nested/helper.ts',
      './.storybook/preview.ts',
    ]);
  });

  it('hashes preview.* alongside the rest of the config dir, so its bytes are covered too', async () => {
    disk.current.directories = { '/repo/packages/ui/.storybook': ['main.ts', 'preview.ts'] };

    const { storybookConfigFiles } = await hashOutOfGraphFiles(input, projectRoot);

    // The graph-rolled `.storybook/preview.ts` entry covers its *imports*; this covers its bytes,
    // which is what closes the empty-preview.ts case where the builder elides the module entirely.
    expect(storybookConfigFiles.has('./.storybook/preview.ts')).toBe(true);
  });

  it('gives static files their own section, excluding them from the config sweep', async () => {
    disk.current.directories = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['mockServiceWorker.js'],
    };

    const { storybookConfigFiles, staticFiles } = await hashOutOfGraphFiles(input, projectRoot);

    // Static wins over the config dir, mirroring v1 testing isStaticFile before isStorybookFile.
    expect([...storybookConfigFiles.keys()]).toEqual(['./.storybook/main.ts']);
    expect([...staticFiles.keys()]).toEqual(['./.storybook/static/mockServiceWorker.js']);
  });

  it('returns an empty static section when staticDirs is unset', async () => {
    disk.current.directories = { '/repo/packages/ui/.storybook': ['main.ts'] };

    const { staticFiles } = await hashOutOfGraphFiles({ ...input, staticDirs: [] }, projectRoot);

    expect(staticFiles.size).toBe(0);
  });

  it('collects static files from every configured static directory', async () => {
    disk.current.directories = {
      '/repo/packages/ui/.storybook': ['main.ts'],
      '/repo/packages/ui/public': ['logo.svg'],
      '/repo/packages/ui/assets': ['font.woff2'],
    };

    const { staticFiles } = await hashOutOfGraphFiles(
      { ...input, staticDirs: ['public', 'assets'] },
      projectRoot
    );

    expect([...staticFiles.keys()]).toEqual(['./assets/font.woff2', './public/logo.svg']);
  });
});

describe('rollUpOutOfGraphFiles', () => {
  it('rolls each section into its own synthetic entry', async () => {
    disk.current.directories = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['logo.svg'],
    };

    const rollUps = await rollUp();

    expect([...rollUps.keys()]).toEqual(['storybookConfig', 'staticFiles']);
  });

  it('moves the config roll-up when a config file content changes', async () => {
    disk.current.directories = { '/repo/packages/ui/.storybook': ['main.ts'] };
    disk.current.fileHashes = { '/repo/packages/ui/.storybook/main.ts': 'M1' };
    const before = await rollUp();

    disk.current.fileHashes = { '/repo/packages/ui/.storybook/main.ts': 'M2' };
    const after = await rollUp();

    expect(after.get('storybookConfig')).not.toBe(before.get('storybookConfig'));
  });

  it('moves the static roll-up when a static file content changes, leaving the config roll-up alone', async () => {
    disk.current.directories = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['logo.svg'],
    };
    const staticFile = '/repo/packages/ui/.storybook/static/logo.svg';
    disk.current.fileHashes = { '/repo/packages/ui/.storybook/main.ts': 'M', [staticFile]: 'A1' };
    const before = await rollUp();

    disk.current.fileHashes = { '/repo/packages/ui/.storybook/main.ts': 'M', [staticFile]: 'A2' };
    const after = await rollUp();

    expect(after.get('staticFiles')).not.toBe(before.get('staticFiles'));
    expect(after.get('storybookConfig')).toBe(before.get('storybookConfig'));
  });

  it('moves the static roll-up when an asset is renamed without changing its bytes', async () => {
    disk.current.directories = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['logo.svg'],
    };
    disk.current.fileHashes = { '/repo/packages/ui/.storybook/static/logo.svg': 'A' };
    const before = await rollUp();

    // Same bytes at a different URL renders differently, so the multiset of contents isn't enough.
    disk.current.directories = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['brand.svg'],
    };
    disk.current.fileHashes = { '/repo/packages/ui/.storybook/static/brand.svg': 'A' };
    const after = await rollUp();

    expect(after.get('staticFiles')).not.toBe(before.get('staticFiles'));
  });

  it('moves the static roll-up when two assets swap contents', async () => {
    disk.current.directories = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['a.png', 'b.png'],
    };
    const [a, b] = [
      '/repo/packages/ui/.storybook/static/a.png',
      '/repo/packages/ui/.storybook/static/b.png',
    ];
    disk.current.fileHashes = { [a]: 'A', [b]: 'B' };
    const before = await rollUp();

    // The multiset of contents is identical, but each URL now serves the other's bytes.
    disk.current.fileHashes = { [a]: 'B', [b]: 'A' };
    const after = await rollUp();

    expect(after.get('staticFiles')).not.toBe(before.get('staticFiles'));
  });

  it('moves the config roll-up when a config file is renamed without changing its bytes', async () => {
    disk.current.directories = { '/repo/packages/ui/.storybook': ['preview-head.html'] };
    disk.current.fileHashes = { '/repo/packages/ui/.storybook/preview-head.html': 'H' };
    const before = await rollUp();

    // Storybook loads config files by name, so the same bytes under a new name inject elsewhere.
    disk.current.directories = { '/repo/packages/ui/.storybook': ['preview-body.html'] };
    disk.current.fileHashes = { '/repo/packages/ui/.storybook/preview-body.html': 'H' };
    const after = await rollUp();

    expect(after.get('storybookConfig')).not.toBe(before.get('storybookConfig'));
  });

  it('omits a section that has no files, matching how the globals catch-all behaves', async () => {
    disk.current.directories = { '/repo/packages/ui/.storybook': ['main.ts'] };

    const rollUps = await rollUp();

    expect(rollUps.has('staticFiles')).toBe(false);
  });

  it('keeps both roll-ups stable when the project moves, since path identity is project-relative', async () => {
    disk.current.directories = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['logo.svg'],
    };
    disk.current.fileHashes = {
      '/repo/packages/ui/.storybook/main.ts': 'M',
      '/repo/packages/ui/.storybook/static/logo.svg': 'A',
    };
    const before = await rollUp();

    disk.current.directories = {
      '/repo/apps/web/.storybook': ['main.ts', 'static'],
      '/repo/apps/web/.storybook/static': ['logo.svg'],
    };
    disk.current.fileHashes = {
      '/repo/apps/web/.storybook/main.ts': 'M',
      '/repo/apps/web/.storybook/static/logo.svg': 'A',
    };
    const after = await rollUp(input, '/repo/apps/web');

    expect(after.get('storybookConfig')).toBe(before.get('storybookConfig'));
    expect(after.get('staticFiles')).toBe(before.get('staticFiles'));
  });
});

async function rollUp(theInput: OutOfGraphInput = input, theProjectRoot = projectRoot) {
  return rollUpOutOfGraphFiles(await hashOutOfGraphFiles(theInput, theProjectRoot), h64ToString);
}
