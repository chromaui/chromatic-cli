import { mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import TestLogger from '../../testLogger';
import { lock, temporaryDirectory, write } from './__fixtures__/temporaryDisk';
import { realProjectFiles } from './projectFiles';

const log = new TestLogger();

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

  it('lists a single file when the path names one, since a staticDirs entry may name a file', async () => {
    const root = temporaryDirectory();
    const filePath = write(root, 'favicon.ico');

    const files = realProjectFiles(log).listTree(filePath);

    expect(files).toEqual([filePath]);
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

  it('ignores a name too long for the file system', () => {
    // Some builders name a module after their whole loader chain instead of a real file path that
    // lives on disk. It's unlikely for a real file path to be larger than ENAMETOOLONG so we'll
    // simply ignore it and move on.
    const root = temporaryDirectory();
    const tooLongToName = path.join(root, `styles.module.css?source=${'A'.repeat(26_000)}`);

    expect(realProjectFiles(log).isFile(tooLongToName)).toBe(false);
    expect(realProjectFiles(log).isDirectory(tooLongToName)).toBe(false);
  });

  it("throws for a failure that isn't the name being too long, because a file we cannot read is a real error", () => {
    const root = temporaryDirectory();
    const unreadable = write(root, 'locked/Secret.tsx');
    // Locking the directory, not the file: stat reads the name from its parent, so an unreadable
    // file still stats fine while an unsearchable directory fails with EACCES.
    lock(path.join(root, 'locked'));

    expect(() => realProjectFiles(log).isFile(unreadable)).toThrow(
      expect.objectContaining({ code: 'EACCES' })
    );
    expect(() => realProjectFiles(log).isDirectory(unreadable)).toThrow(
      expect.objectContaining({ code: 'EACCES' })
    );
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

  it('reports no version for a package that is not installed, logging the cause at debug', () => {
    const root = temporaryDirectory();

    expect(realProjectFiles(log).packageVersion(root, '@storybook/builder-vite')).toBeUndefined();
    expect(log.debug).toHaveBeenCalledWith(
      `Could not resolve @storybook/builder-vite from ${root}`,
      expect.objectContaining({ code: 'MODULE_NOT_FOUND' })
    );
    expect(log.debug).toHaveBeenCalledWith(
      'Directories checked:',
      expect.arrayContaining([`${path.join(root, 'node_modules')} (missing)`])
    );
  });
});

describe('realProjectFiles realPath', () => {
  it('resolves a path through a symlinked directory to the file it leads to, as a base dir linked from apps/ would be', () => {
    const root = realpathSync(temporaryDirectory());
    const button = write(root, 'packages/ui/Button.tsx');
    mkdirSync(path.join(root, 'apps'));
    symlinkSync(path.join(root, 'packages/ui'), path.join(root, 'apps/storybook'));

    expect(realProjectFiles(log).realPath(path.join(root, 'apps/storybook/Button.tsx'))).toBe(
      button
    );
  });

  it('returns a real path unchanged', () => {
    const button = write(realpathSync(temporaryDirectory()), 'Button.tsx');

    expect(realProjectFiles(log).realPath(button)).toBe(button);
  });

  it('returns a path to nothing as given, since there is nothing to resolve', () => {
    const absent = path.join(realpathSync(temporaryDirectory()), 'missing.tsx');

    expect(realProjectFiles(log).realPath(absent)).toBe(absent);
  });
});
