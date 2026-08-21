import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import TestLogger from '../../testLogger';
import { realProjectFiles } from './projectFiles';

// The real adapter's whole job is knowing what the disk means, so these run against real temporary
// directories: real symlinks, a real cycle and a real unreadable directory. A fake that simulates
// symlink semantics can only prove the fake follows them.
let temporaryDirectories: string[] = [];
let lockedDirectories: string[] = [];
const log = new TestLogger();

afterEach(() => {
  // Unlock the directories before removal because it's required in order to remove them.
  for (const directory of lockedDirectories) {
    chmodSync(directory, 0o755);
  }
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  // Reset the lists, so the next test's cleanup doesn't chmod a path this one already removed.
  temporaryDirectories = [];
  lockedDirectories = [];
});

/**
 * Creates a temporary directory in the system's temporary directory.
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
 * "Installs" a package under a directory's `node_modules` to match a real repository structure.
 *
 * @param root The directory to install within.
 * @param packageName The package's name.
 * @param packageJson The manifest to write, verbatim.
 */
function install(root: string, packageName: string, packageJson: Record<string, unknown>) {
  write(root, `node_modules/${packageName}/package.json`, JSON.stringify(packageJson));
}

/**
 * Updates the permissions of the path so it's unreadable, so a test can test failed read
 * operations.
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

    const files = realProjectFiles(log).listTree(path.join(root, 'static'));

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

    const files = realProjectFiles(log).listTree(path.join(root, 'static'));

    expect(files).toEqual([path.join(root, 'static/logo.svg')]);
  });

  it('descends into a symlinked directory, so a vendored asset tree is not invisible', async () => {
    const root = temporaryDirectory();
    write(root, 'node_modules/pkg/dist/a.png');
    write(root, 'node_modules/pkg/dist/b.png');
    mkdirSync(path.join(root, 'static'));
    symlinkSync(path.join(root, 'node_modules/pkg/dist'), path.join(root, 'static/vendor'));

    const files = realProjectFiles(log).listTree(path.join(root, 'static'));

    expect(files.sort()).toEqual([
      path.join(root, 'static/vendor/a.png'),
      path.join(root, 'static/vendor/b.png'),
    ]);
  });

  it('lists the same target through every symlink alias and reflects alias removal', async () => {
    const root = temporaryDirectory();
    write(root, 'vendor/assets/logo.svg');
    mkdirSync(path.join(root, 'static'));
    symlinkSync(path.join(root, 'vendor/assets'), path.join(root, 'static/brand'));
    symlinkSync(path.join(root, 'vendor/assets'), path.join(root, 'static/legacy'));

    const before = realProjectFiles(log).listTree(path.join(root, 'static'));
    rmSync(path.join(root, 'static/legacy'));
    const after = realProjectFiles(log).listTree(path.join(root, 'static'));

    expect(before.sort()).toEqual([
      path.join(root, 'static/brand/logo.svg'),
      path.join(root, 'static/legacy/logo.svg'),
    ]);
    expect(after).toEqual([path.join(root, 'static/brand/logo.svg')]);
  });

  it('contributes nothing for a broken symlink, finishing the rest of the sweep', async () => {
    const root = temporaryDirectory();
    write(root, 'static/keep.svg');
    symlinkSync(path.join(root, 'gone.svg'), path.join(root, 'static/logo.svg'));

    const files = realProjectFiles(log).listTree(path.join(root, 'static'));

    expect(files).toEqual([path.join(root, 'static/keep.svg')]);
  });

  it('visits a symlink cycle once', async () => {
    const root = temporaryDirectory();
    write(root, 'static/logo.svg');
    symlinkSync(path.join(root, 'static'), path.join(root, 'static/loop'));

    const files = realProjectFiles(log).listTree(path.join(root, 'static'));

    expect(files).toEqual([path.join(root, 'static/logo.svg')]);
  });

  it('is empty for a directory that does not exist, since a missing staticDir is not an error', async () => {
    const root = temporaryDirectory();

    const files = realProjectFiles(log).listTree(path.join(root, 'absent'));

    expect(files).toEqual([]);
  });

  it('is empty for an unreadable directory, rather than failing the whole sweep', async () => {
    const root = temporaryDirectory();
    write(root, 'locked/secret.ts');
    // A directory can resolve and still refuse to be listed (EACCES), which the walk meets at a
    // different point than a missing directory.
    lock(path.join(root, 'locked'));

    const files = realProjectFiles(log).listTree(path.join(root, 'locked'));

    expect(files).toEqual([]);
  });
});

describe('realProjectFiles isFile and isDirectory', () => {
  it('reads a regular file as a file and not a directory', () => {
    const root = temporaryDirectory();
    const filePath = write(root, 'src/Button.tsx');

    expect(realProjectFiles(log).isFile(filePath)).toBe(true);
    expect(realProjectFiles(log).isDirectory(filePath)).toBe(false);
  });

  it('reads a directory as a directory and not a file, which is what keeps EISDIR out of hashing', () => {
    // `storybook-builder-rsbuild` 3.3.0/3.3.1 name a module after a directory, and reading one
    // throws EISDIR.
    const root = temporaryDirectory();
    write(root, 'node_modules/@storybook/react/dist/entry-preview.js');
    const directoryNamedAsAModule = path.join(root, 'node_modules/@storybook/react/dist');

    expect(realProjectFiles(log).isFile(directoryNamedAsAModule)).toBe(false);
    expect(realProjectFiles(log).isDirectory(directoryNamedAsAModule)).toBe(true);
  });

  it('reads an absent path as false for both', () => {
    const root = temporaryDirectory();
    const absent = path.join(root, 'src/gone.tsx');

    expect(realProjectFiles(log).isFile(absent)).toBe(false);
    expect(realProjectFiles(log).isDirectory(absent)).toBe(false);
  });

  it('reads a symlink to a file as a file', () => {
    const root = temporaryDirectory();
    const target = write(root, 'vendor/real-logo.svg');
    mkdirSync(path.join(root, 'static'));
    symlinkSync(target, path.join(root, 'static/logo.svg'));

    expect(realProjectFiles(log).isFile(path.join(root, 'static/logo.svg'))).toBe(true);
  });
});

describe('realProjectFiles hashAll', () => {
  it('hashes each file, keyed by the absolute path it was read from', async () => {
    const root = temporaryDirectory();
    const button = write(root, 'src/Button.tsx');
    const header = write(root, 'src/Header.tsx');

    const hashes = await realProjectFiles(log).hashAll([button, header]);

    expect(Object.keys(hashes).sort()).toEqual([button, header].sort());
    expect(hashes[button]).not.toBe(hashes[header]);
  });

  it('hashes content, so identical bytes at two paths hash the same', async () => {
    const root = temporaryDirectory();
    const original = write(root, 'src/Button.tsx', 'export const Button = () => null;');
    const copy = write(root, 'src/copy/Button.tsx', 'export const Button = () => null;');

    const hashes = await realProjectFiles(log).hashAll([original, copy]);

    expect(hashes[original]).toBe(hashes[copy]);
  });

  it('hashes nothing for no paths', async () => {
    expect(await realProjectFiles(log).hashAll([])).toEqual({});
  });

  it('read errors throw with the file that it failed to read', async () => {
    const root = temporaryDirectory();
    const readable = write(root, 'src/Button.tsx');
    const unreadable = write(root, 'src/Secret.tsx');
    lock(unreadable);

    let err: Error | undefined;
    try {
      await realProjectFiles(log).hashAll([readable, unreadable]);
    } catch (error) {
      err = error as Error;
    }

    expect(err?.message).toContain(unreadable);
  });
});

describe('realProjectFiles writeFile', () => {
  it('creates absent parent directories before writing', () => {
    const root = temporaryDirectory();
    const filePath = path.join(root, 'storybook-static/.chromatic/turbosnap-manifest.json');

    realProjectFiles(log).writeFile(filePath, '{"storybookHash":"abc"}');

    expect(readFileSync(filePath, 'utf8')).toBe('{"storybookHash":"abc"}');
  });

  it('writes the contents to the path, readable back as the same bytes', () => {
    const root = temporaryDirectory();
    const filePath = path.join(root, 'turbosnap-manifest.json');

    realProjectFiles(log).writeFile(filePath, '{"storybookHash":"abc"}');

    expect(readFileSync(filePath, 'utf8')).toBe('{"storybookHash":"abc"}');
  });

  it('overwrites an existing file rather than appending', () => {
    const root = temporaryDirectory();
    const filePath = write(root, 'turbosnap-manifest.json', 'stale');

    realProjectFiles(log).writeFile(filePath, 'fresh');

    expect(readFileSync(filePath, 'utf8')).toBe('fresh');
  });
});

describe('realProjectFiles packageVersion', () => {
  it('reads the installed version from a real package layout', () => {
    const root = temporaryDirectory();
    install(root, 'storybook', { name: 'storybook', version: '9.1.20' });

    expect(realProjectFiles(log).packageVersion(root, 'storybook')).toBe('9.1.20');
  });

  it('walks up from the directory, so a workspace-hoisted install is found', () => {
    const repositoryRoot = temporaryDirectory();
    const projectRoot = path.join(repositoryRoot, 'packages/ui');
    mkdirSync(projectRoot, { recursive: true });
    install(repositoryRoot, 'storybook', { name: 'storybook', version: '9.1.20' });

    expect(realProjectFiles(log).packageVersion(projectRoot, 'storybook')).toBe('9.1.20');
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

    expect(realProjectFiles(log).packageVersion(root, 'sealed')).toBeUndefined();
  });

  it('reports no version for a package whose manifest has none', () => {
    const root = temporaryDirectory();
    install(root, 'storybook', { name: 'storybook' });

    expect(realProjectFiles(log).packageVersion(root, 'storybook')).toBeUndefined();
  });

  it('reports no version for a package that is not installed', () => {
    const root = temporaryDirectory();

    expect(realProjectFiles(log).packageVersion(root, '@storybook/builder-vite')).toBeUndefined();
  });
});
