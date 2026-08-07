import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { inMemoryProjectFiles, realProjectFiles } from './projectFiles';

// The real adapter's whole job is knowing what the disk means, so these run against real temporary
// directories: real symlinks, a real cycle and a real unreadable directory. A fake that simulates
// symlink semantics can only prove the fake follows them.
const temporaryDirectories: string[] = [];
const lockedDirectories: string[] = [];

afterEach(() => {
  // Unlocked before removal, because removing a directory means listing it.
  for (const directory of lockedDirectories.splice(0)) chmodSync(directory, 0o755);
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * Creates a temporary directory, removed after the test.
 *
 * @returns The absolute path of the directory.
 */
function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'chromatic-project-files-'));
  temporaryDirectories.push(directory);
  return directory;
}

/**
 * Writes a file, creating its parent directories.
 *
 * @param root The directory to write within.
 * @param relativePath The file's path relative to `root`.
 *
 * @returns The absolute path written.
 */
function write(root: string, relativePath: string): string {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, relativePath);
  return absolutePath;
}

/**
 * Makes a directory refuse to be listed, as an EACCES directory does, unlocking it after the test so
 * the removal can list it.
 *
 * @param absoluteDirectory The directory to lock.
 */
function lock(absoluteDirectory: string) {
  lockedDirectories.push(absoluteDirectory);
  chmodSync(absoluteDirectory, 0o000);
}

describe('realProjectFiles listTree', () => {
  it('lists every file under the directory, recursively', async () => {
    const root = temporaryDirectory();
    write(root, 'static/logo.svg');
    write(root, 'static/nested/deep/font.woff2');

    const files = await realProjectFiles().listTree(path.join(root, 'static'));

    expect(files.sort()).toEqual([
      path.join(root, 'static/logo.svg'),
      path.join(root, 'static/nested/deep/font.woff2'),
    ]);
  });

  it('names a symlinked file by the link path, since that is the URL it is served at', async () => {
    const root = temporaryDirectory();
    const target = write(root, 'vendor/real-logo.svg');
    mkdirSync(path.join(root, 'static'));
    symlinkSync(target, path.join(root, 'static/logo.svg'));

    const files = await realProjectFiles().listTree(path.join(root, 'static'));

    expect(files).toEqual([path.join(root, 'static/logo.svg')]);
  });

  it('descends into a symlinked directory, so a vendored asset tree is not invisible', async () => {
    const root = temporaryDirectory();
    write(root, 'node_modules/pkg/dist/a.png');
    write(root, 'node_modules/pkg/dist/b.png');
    mkdirSync(path.join(root, 'static'));
    symlinkSync(path.join(root, 'node_modules/pkg/dist'), path.join(root, 'static/vendor'));

    const files = await realProjectFiles().listTree(path.join(root, 'static'));

    expect(files.sort()).toEqual([
      path.join(root, 'static/vendor/a.png'),
      path.join(root, 'static/vendor/b.png'),
    ]);
  });

  it('contributes nothing for a broken symlink, finishing the rest of the sweep', async () => {
    const root = temporaryDirectory();
    write(root, 'static/keep.svg');
    symlinkSync(path.join(root, 'gone.svg'), path.join(root, 'static/logo.svg'));

    const files = await realProjectFiles().listTree(path.join(root, 'static'));

    expect(files).toEqual([path.join(root, 'static/keep.svg')]);
  });

  it('visits a symlink cycle once instead of diverging, since hashing has no count cap', async () => {
    const root = temporaryDirectory();
    write(root, 'static/logo.svg');
    symlinkSync(path.join(root, 'static'), path.join(root, 'static/loop'));

    const files = await realProjectFiles().listTree(path.join(root, 'static'));

    expect(files).toEqual([path.join(root, 'static/logo.svg')]);
  });

  it('is empty for a directory that does not exist, since a missing staticDir is not an error', async () => {
    const root = temporaryDirectory();

    const files = await realProjectFiles().listTree(path.join(root, 'absent'));

    expect(files).toEqual([]);
  });

  it('is empty for an unreadable directory, rather than failing the whole sweep', async () => {
    const root = temporaryDirectory();
    write(root, 'locked/secret.ts');
    // A directory can resolve and still refuse to be listed (EACCES), which the walk meets at a
    // different point than a missing directory.
    lock(path.join(root, 'locked'));

    const files = await realProjectFiles().listTree(path.join(root, 'locked'));

    expect(files).toEqual([]);
  });
});

describe('inMemoryProjectFiles listTree', () => {
  it('lists every file under the directory the tree describes, recursively', async () => {
    const directoryTree = {
      current: {
        '/repo/packages/ui/.storybook': ['main.ts', 'nested'],
        '/repo/packages/ui/.storybook/nested': ['helper.ts'],
      },
    };

    const files = await inMemoryProjectFiles(directoryTree).listTree(
      '/repo/packages/ui/.storybook'
    );

    expect(files).toEqual([
      '/repo/packages/ui/.storybook/main.ts',
      '/repo/packages/ui/.storybook/nested/helper.ts',
    ]);
  });

  it('is empty for a directory the tree does not describe', async () => {
    const files = await inMemoryProjectFiles({ current: {} }).listTree('/repo/packages/ui/absent');

    expect(files).toEqual([]);
  });

  it('reads the tree on each call, so a suite can set its disk per test', async () => {
    const directoryTree = { current: {} as Record<string, string[]> };
    const projectFiles = inMemoryProjectFiles(directoryTree);

    directoryTree.current = { '/repo/packages/ui/.storybook': ['main.ts'] };

    expect(await projectFiles.listTree('/repo/packages/ui/.storybook')).toEqual([
      '/repo/packages/ui/.storybook/main.ts',
    ]);
  });
});
