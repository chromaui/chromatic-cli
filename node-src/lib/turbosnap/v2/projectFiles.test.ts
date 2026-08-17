import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { InMemoryDiskReference, inMemoryProjectFiles, realProjectFiles } from './projectFiles';

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
 * @param content The bytes to write, its own path by default so two files differ.
 *
 * @returns The absolute path written.
 */
function write(root: string, relativePath: string, content = relativePath): string {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
  return absolutePath;
}

/**
 * Installs a package under a directory's `node_modules`, as a real install lays it out.
 *
 * @param root The directory to install within.
 * @param packageName The package's name.
 * @param packageJson The manifest to write, verbatim.
 */
function install(root: string, packageName: string, packageJson: Record<string, unknown>) {
  write(root, `node_modules/${packageName}/package.json`, JSON.stringify(packageJson));
}

/**
 * Makes a path refuse to be read, as an EACCES path does, unlocking it after the test so the removal
 * can read it.
 *
 * @param absolutePath The file or directory to lock.
 */
function lock(absolutePath: string) {
  lockedDirectories.push(absolutePath);
  chmodSync(absolutePath, 0o000);
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

describe('realProjectFiles isFile and isDirectory', () => {
  it('reads a regular file as a file and not a directory', () => {
    const root = temporaryDirectory();
    const filePath = write(root, 'src/Button.tsx');

    expect(realProjectFiles().isFile(filePath)).toBe(true);
    expect(realProjectFiles().isDirectory(filePath)).toBe(false);
  });

  it('reads a directory as a directory and not a file, which is what keeps EISDIR out of hashing', () => {
    // `storybook-builder-rsbuild` 3.3.0/3.3.1 name a module after a directory, and reading one
    // throws EISDIR and fails the whole manifest.
    const root = temporaryDirectory();
    write(root, 'node_modules/@storybook/react/dist/entry-preview.js');
    const directoryNamedAsAModule = path.join(root, 'node_modules/@storybook/react/dist');

    expect(realProjectFiles().isFile(directoryNamedAsAModule)).toBe(false);
    expect(realProjectFiles().isDirectory(directoryNamedAsAModule)).toBe(true);
  });

  it('reads an absent path as neither, since absence is an answer here', () => {
    const root = temporaryDirectory();
    const absent = path.join(root, 'src/gone.tsx');

    expect(realProjectFiles().isFile(absent)).toBe(false);
    expect(realProjectFiles().isDirectory(absent)).toBe(false);
  });

  it('reads a symlink to a file as a file, since that is what Storybook serves', () => {
    const root = temporaryDirectory();
    const target = write(root, 'vendor/real-logo.svg');
    mkdirSync(path.join(root, 'static'));
    symlinkSync(target, path.join(root, 'static/logo.svg'));

    expect(realProjectFiles().isFile(path.join(root, 'static/logo.svg'))).toBe(true);
  });
});

describe('realProjectFiles hashAll', () => {
  it('hashes each file, keyed by the absolute path it was read from', async () => {
    const root = temporaryDirectory();
    const button = write(root, 'src/Button.tsx');
    const header = write(root, 'src/Header.tsx');

    const hashes = await realProjectFiles().hashAll([button, header]);

    expect(Object.keys(hashes).sort()).toEqual([button, header].sort());
    expect(hashes[button]).not.toBe(hashes[header]);
  });

  it('hashes content, so identical bytes at two paths hash the same', async () => {
    const root = temporaryDirectory();
    const original = write(root, 'src/Button.tsx', 'export const Button = () => null;');
    const copy = write(root, 'src/copy/Button.tsx', 'export const Button = () => null;');

    const hashes = await realProjectFiles().hashAll([original, copy]);

    expect(hashes[original]).toBe(hashes[copy]);
  });

  it('hashes nothing for no paths, rather than reading the disk at all', async () => {
    expect(await realProjectFiles().hashAll([])).toEqual({});
  });

  it('throws naming the file it could not read, so the Sentry event says which one', async () => {
    const root = temporaryDirectory();
    const readable = write(root, 'src/Button.tsx');
    const unreadable = write(root, 'src/Secret.tsx');
    lock(unreadable);

    let err: Error | undefined;
    try {
      await realProjectFiles().hashAll([readable, unreadable]);
    } catch (error) {
      err = error as Error;
    }

    // Unreadability is a bug rather than an answer: the manifest would silently omit content, so
    // this reaches the entry point and bails TurboSnap to v1.
    expect(err?.message).toContain(unreadable);
  });
});

describe('realProjectFiles packageVersion', () => {
  it('reads the installed version from a real package layout', () => {
    const root = temporaryDirectory();
    install(root, 'storybook', { name: 'storybook', version: '9.1.20' });

    expect(realProjectFiles().packageVersion(root, 'storybook')).toBe('9.1.20');
  });

  it('walks up from the directory, so a workspace-hoisted install is found', () => {
    const repositoryRoot = temporaryDirectory();
    const projectRoot = path.join(repositoryRoot, 'packages/ui');
    mkdirSync(projectRoot, { recursive: true });
    install(repositoryRoot, 'storybook', { name: 'storybook', version: '9.1.20' });

    expect(realProjectFiles().packageVersion(projectRoot, 'storybook')).toBe('9.1.20');
  });

  it('reports no version for a package that does not export its own manifest', () => {
    // Resolving `${name}/package.json` is what avoids the `dist/*` entries an `exports` map usually
    // omits; a package that does not export the manifest either simply has no version to report.
    const root = temporaryDirectory();
    install(root, 'sealed', {
      name: 'sealed',
      version: '1.2.3',
      exports: { '.': './index.js' },
    });

    expect(realProjectFiles().packageVersion(root, 'sealed')).toBeUndefined();
  });

  it('reports no version for a package whose manifest has none', () => {
    // `storybook` is installed as the CLI on Storybook 8 with no version of its own to report, and
    // reporting none is what sends resolveStorybookVersion on to the next package.
    const root = temporaryDirectory();
    install(root, 'storybook', { name: 'storybook' });

    expect(realProjectFiles().packageVersion(root, 'storybook')).toBeUndefined();
  });

  it('reports no version for a package that is not installed', () => {
    const root = temporaryDirectory();

    expect(realProjectFiles().packageVersion(root, '@storybook/builder-vite')).toBeUndefined();
  });
});

describe('inMemoryProjectFiles', () => {
  it('hashes a file as the disk describes it, and as `x` for one it does not', async () => {
    const disk: InMemoryDiskReference = {
      current: { fileHashes: { '/repo/packages/ui/src/Button.tsx': 'B' } },
    };

    expect(
      await inMemoryProjectFiles(disk).hashAll([
        '/repo/packages/ui/src/Button.tsx',
        '/repo/packages/ui/src/Header.tsx',
      ])
    ).toEqual({
      '/repo/packages/ui/src/Button.tsx': 'B',
      '/repo/packages/ui/src/Header.tsx': 'x',
    });
  });

  it('refuses to hash a path with no file, as the real disk does', async () => {
    const disk: InMemoryDiskReference = {
      current: { isAbsent: (candidate) => candidate.includes('lazy') },
    };

    let err: Error | undefined;
    try {
      await inMemoryProjectFiles(disk).hashAll(['/repo/packages/ui/src/ lazy namespace object']);
    } catch (error) {
      err = error as Error;
    }

    expect(err?.message).toContain('lazy');
  });

  it('reads a described directory, and a name spelled with a trailing slash, as a directory', () => {
    const disk: InMemoryDiskReference = {
      current: { directories: { '/repo/packages/ui/.storybook': ['main.ts'] } },
    };
    const projectFiles = inMemoryProjectFiles(disk);

    expect(projectFiles.isDirectory('/repo/packages/ui/.storybook')).toBe(true);
    expect(projectFiles.isFile('/repo/packages/ui/.storybook')).toBe(false);
    expect(projectFiles.isFile('/repo/packages/ui/node_modules/@storybook/react/dist/')).toBe(
      false
    );
    expect(projectFiles.isFile('/repo/packages/ui/.storybook/main.ts')).toBe(true);
  });

  it('reports the version the disk records for a package, whatever directory it is asked from', () => {
    const disk: InMemoryDiskReference = {
      current: { packageVersions: { storybook: '9.1.20' } },
    };

    expect(inMemoryProjectFiles(disk).packageVersion('/repo/packages/ui', 'storybook')).toBe(
      '9.1.20'
    );
    expect(
      inMemoryProjectFiles(disk).packageVersion('/repo/packages/ui', '@storybook/core')
    ).toBeUndefined();
  });
});

describe('inMemoryProjectFiles listTree', () => {
  it('lists every file under the directory the tree describes, recursively', async () => {
    const disk = {
      current: {
        directories: {
          '/repo/packages/ui/.storybook': ['main.ts', 'nested'],
          '/repo/packages/ui/.storybook/nested': ['helper.ts'],
        },
      },
    };

    const files = await inMemoryProjectFiles(disk).listTree('/repo/packages/ui/.storybook');

    expect(files).toEqual([
      '/repo/packages/ui/.storybook/main.ts',
      '/repo/packages/ui/.storybook/nested/helper.ts',
    ]);
  });

  it('is empty for a directory the tree does not describe', async () => {
    const files = await inMemoryProjectFiles({ current: {} }).listTree('/repo/packages/ui/absent');

    expect(files).toEqual([]);
  });

  it('reads the disk on each call, so a suite can set it per test', async () => {
    const disk: InMemoryDiskReference = { current: {} };
    const projectFiles = inMemoryProjectFiles(disk);

    disk.current = { directories: { '/repo/packages/ui/.storybook': ['main.ts'] } };

    expect(await projectFiles.listTree('/repo/packages/ui/.storybook')).toEqual([
      '/repo/packages/ui/.storybook/main.ts',
    ]);
  });
});
