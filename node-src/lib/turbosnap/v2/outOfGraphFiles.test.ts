import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashOutOfGraphFiles, OutOfGraphInput, rollUpOutOfGraphFiles } from './outOfGraphFiles';

// An in-memory tree of absolute directory -> entry names. A key that maps to entries is a directory;
// anything else named by a parent is a file. Backing the sweep this way keeps these tests off disk.
// `symlinkTargetsRef` names entries that are symlinks, mapping absolute path -> absolute target: like
// a real `Dirent`, those report neither isDirectory nor isFile, so only stat/realpath resolve them.
// `unreadableDirectoriesRef` names directories that exist and resolve but refuse to be listed, as an
// EACCES directory does. That case has to be reachable independently of a missing directory, because
// the sweep handles the two at different points in the walk.
const { directoryTreeRef, symlinkTargetsRef, unreadableDirectoriesRef, fakeFs } = vi.hoisted(() => {
  const directoryTreeReference = { current: {} as Record<string, string[]> };
  const symlinkTargetsReference = { current: {} as Record<string, string> };
  const unreadableDirectoriesReference = { current: new Set<string>() };

  // Resolves every symlinked segment of a path, as the real fs does, refusing to loop forever (ELOOP).
  function resolve(entryPath: string) {
    let resolved = '';
    for (const segment of entryPath.split('/').filter(Boolean)) {
      resolved = `${resolved}/${segment}`;
      const seen = new Set<string>();
      while (symlinkTargetsReference.current[resolved]) {
        if (seen.has(resolved)) throw new Error(`ELOOP: ${entryPath}`);
        seen.add(resolved);
        resolved = symlinkTargetsReference.current[resolved];
      }
    }
    return resolved;
  }

  function isDirectoryAt(resolved: string) {
    return Boolean(directoryTreeReference.current[resolved]);
  }

  // A file exists only where its parent directory lists it, so a dangling symlink target is not one.
  function isFileAt(resolved: string) {
    const segments = resolved.split('/');
    const name = segments.pop() as string;
    return (
      !isDirectoryAt(resolved) &&
      Boolean(directoryTreeReference.current[segments.join('/')]?.includes(name))
    );
  }

  function assertExists(entryPath: string, resolved: string) {
    if (!isDirectoryAt(resolved) && !isFileAt(resolved)) throw new Error(`ENOENT: ${entryPath}`);
  }

  const fakeFs = {
    readdir: async (directory: string) => {
      if (unreadableDirectoriesReference.current.has(directory)) {
        throw new Error(`EACCES: permission denied, scandir '${directory}'`);
      }
      const entries = directoryTreeReference.current[resolve(directory)];
      if (!entries) throw new Error(`ENOENT: ${directory}`);
      // A Dirent reports on the link itself, never its target, so a symlink is neither file nor
      // directory — only stat and realpath resolve it.
      return entries.map((name) => {
        const entryPath = `${directory}/${name}`;
        const isLink = Boolean(symlinkTargetsReference.current[entryPath]);
        return {
          name,
          isDirectory: () => !isLink && isDirectoryAt(resolve(entryPath)),
          isFile: () => !isLink && isFileAt(resolve(entryPath)),
        };
      });
    },
    realpath: async (entryPath: string) => {
      const resolved = resolve(entryPath);
      assertExists(entryPath, resolved);
      return resolved;
    },
    stat: async (entryPath: string) => {
      const resolved = resolve(entryPath);
      assertExists(entryPath, resolved);
      return { isDirectory: () => isDirectoryAt(resolved), isFile: () => isFileAt(resolved) };
    },
  };

  return {
    directoryTreeRef: directoryTreeReference,
    symlinkTargetsRef: symlinkTargetsReference,
    unreadableDirectoriesRef: unreadableDirectoriesReference,
    fakeFs,
  };
});

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
  ...fakeFs,
}));

// Content hashes are keyed by the absolute path getFileHashes is called with.
const { fileHashesRef } = vi.hoisted(() => ({
  fileHashesRef: { current: {} as Record<string, string> },
}));

vi.mock('../../getFileHashes', () => ({
  getFileHashes: (files: string[]) =>
    Promise.resolve(Object.fromEntries(files.map((f) => [f, fileHashesRef.current[f] ?? 'x']))),
}));

const projectRoot = '/repo/packages/ui';
const input = { configDir: '.storybook', staticDirs: ['.storybook/static'] };

const h64ToString = (value: string) => `h(${value})`;

beforeEach(() => {
  directoryTreeRef.current = {};
  symlinkTargetsRef.current = {};
  unreadableDirectoriesRef.current = new Set();
  fileHashesRef.current = {};
});

describe('hashOutOfGraphFiles', () => {
  it('hashes every config file recursively, keyed by canonical git-root-relative path', async () => {
    directoryTreeRef.current = {
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
    directoryTreeRef.current = { '/repo/packages/ui/.storybook': ['main.ts', 'preview.ts'] };

    const { storybookConfigFiles } = await hashOutOfGraphFiles(input, projectRoot);

    // The graph-rolled `.storybook/preview.ts` entry covers its *imports*; this covers its bytes,
    // which is what closes the empty-preview.ts case where the builder elides the module entirely.
    expect(storybookConfigFiles.has('./.storybook/preview.ts')).toBe(true);
  });

  it('gives static files their own section, excluding them from the config sweep', async () => {
    directoryTreeRef.current = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['mockServiceWorker.js'],
    };

    const { storybookConfigFiles, staticFiles } = await hashOutOfGraphFiles(input, projectRoot);

    // Static wins over the config dir, mirroring v1 testing isStaticFile before isStorybookFile.
    expect([...storybookConfigFiles.keys()]).toEqual(['./.storybook/main.ts']);
    expect([...staticFiles.keys()]).toEqual(['./.storybook/static/mockServiceWorker.js']);
  });

  it('returns an empty static section when staticDirs is unset', async () => {
    directoryTreeRef.current = { '/repo/packages/ui/.storybook': ['main.ts'] };

    const { staticFiles } = await hashOutOfGraphFiles(
      { configDir: '.storybook', staticDirs: [] },
      projectRoot
    );

    expect(staticFiles.size).toBe(0);
  });

  it('treats a configured but missing directory as contributing nothing rather than throwing', async () => {
    directoryTreeRef.current = {};

    const { storybookConfigFiles, staticFiles } = await hashOutOfGraphFiles(input, projectRoot);

    expect(storybookConfigFiles.size).toBe(0);
    expect(staticFiles.size).toBe(0);
  });

  it('treats an unreadable directory as contributing nothing rather than throwing', async () => {
    // A directory can resolve and still refuse to be listed (EACCES). The sweep is best-effort, so
    // one unreadable subtree must not fail the build or discard the siblings already collected.
    directoryTreeRef.current = {
      '/repo/packages/ui/.storybook': ['main.ts', 'locked'],
      '/repo/packages/ui/.storybook/locked': ['secret.ts'],
    };
    unreadableDirectoriesRef.current = new Set(['/repo/packages/ui/.storybook/locked']);

    const { storybookConfigFiles } = await hashOutOfGraphFiles(input, projectRoot);

    expect([...storybookConfigFiles.keys()]).toEqual(['./.storybook/main.ts']);
  });

  it('collects static files from every configured static directory', async () => {
    directoryTreeRef.current = {
      '/repo/packages/ui/.storybook': ['main.ts'],
      '/repo/packages/ui/public': ['logo.svg'],
      '/repo/packages/ui/assets': ['font.woff2'],
    };

    const { staticFiles } = await hashOutOfGraphFiles(
      { configDir: '.storybook', staticDirs: ['public', 'assets'] },
      projectRoot
    );

    expect([...staticFiles.keys()]).toEqual(['./assets/font.woff2', './public/logo.svg']);
  });

  it('hashes a symlinked static file by its target bytes, since Storybook serves those bytes', async () => {
    directoryTreeRef.current = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['logo.svg'],
      '/repo/packages/ui/vendor': ['real-logo.svg'],
    };
    symlinkTargetsRef.current = {
      '/repo/packages/ui/.storybook/static/logo.svg': '/repo/packages/ui/vendor/real-logo.svg',
    };

    const { staticFiles } = await hashOutOfGraphFiles(input, projectRoot);

    // Keyed by the link's own path, not the target's: that is the URL Storybook serves it at.
    expect([...staticFiles.keys()]).toEqual(['./.storybook/static/logo.svg']);
  });

  it('descends into a symlinked static directory, so a vendored asset tree is not invisible', async () => {
    directoryTreeRef.current = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['vendor'],
      '/repo/packages/ui/node_modules/pkg/dist': ['a.png', 'b.png'],
    };
    symlinkTargetsRef.current = {
      '/repo/packages/ui/.storybook/static/vendor': '/repo/packages/ui/node_modules/pkg/dist',
    };

    const { staticFiles } = await hashOutOfGraphFiles(input, projectRoot);

    expect([...staticFiles.keys()]).toEqual([
      './.storybook/static/vendor/a.png',
      './.storybook/static/vendor/b.png',
    ]);
  });

  it('treats a broken symlink as contributing nothing rather than throwing', async () => {
    directoryTreeRef.current = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['logo.svg'],
    };
    symlinkTargetsRef.current = {
      '/repo/packages/ui/.storybook/static/logo.svg': '/repo/packages/ui/gone.svg',
    };

    const { storybookConfigFiles, staticFiles } = await hashOutOfGraphFiles(input, projectRoot);

    expect(staticFiles.size).toBe(0);
    // The rest of the sweep still completes.
    expect([...storybookConfigFiles.keys()]).toEqual(['./.storybook/main.ts']);
  });

  it('visits a symlink cycle once instead of diverging, since unbounded hashing has no count cap', async () => {
    directoryTreeRef.current = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['logo.svg', 'loop'],
    };
    symlinkTargetsRef.current = {
      '/repo/packages/ui/.storybook/static/loop': '/repo/packages/ui/.storybook/static',
    };

    const { staticFiles } = await hashOutOfGraphFiles(input, projectRoot);

    expect([...staticFiles.keys()]).toEqual(['./.storybook/static/logo.svg']);
  });
});

describe('rollUpOutOfGraphFiles', () => {
  it('rolls each section into its own synthetic entry', async () => {
    directoryTreeRef.current = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['logo.svg'],
    };

    const rollUps = await rollUp();

    expect([...rollUps.keys()]).toEqual(['<storybookConfig>', '<staticFiles>']);
  });

  it('moves the config roll-up when a config file content changes', async () => {
    directoryTreeRef.current = { '/repo/packages/ui/.storybook': ['main.ts'] };
    fileHashesRef.current = { '/repo/packages/ui/.storybook/main.ts': 'M1' };
    const before = await rollUp();

    fileHashesRef.current = { '/repo/packages/ui/.storybook/main.ts': 'M2' };
    const after = await rollUp();

    expect(after.get('<storybookConfig>')).not.toBe(before.get('<storybookConfig>'));
  });

  it('moves the static roll-up when a static file content changes, leaving the config roll-up alone', async () => {
    directoryTreeRef.current = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['logo.svg'],
    };
    const staticFile = '/repo/packages/ui/.storybook/static/logo.svg';
    fileHashesRef.current = { '/repo/packages/ui/.storybook/main.ts': 'M', [staticFile]: 'A1' };
    const before = await rollUp();

    fileHashesRef.current = { '/repo/packages/ui/.storybook/main.ts': 'M', [staticFile]: 'A2' };
    const after = await rollUp();

    expect(after.get('<staticFiles>')).not.toBe(before.get('<staticFiles>'));
    expect(after.get('<storybookConfig>')).toBe(before.get('<storybookConfig>'));
  });

  it('moves the static roll-up when an asset is renamed without changing its bytes', async () => {
    directoryTreeRef.current = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['logo.svg'],
    };
    fileHashesRef.current = { '/repo/packages/ui/.storybook/static/logo.svg': 'A' };
    const before = await rollUp();

    // Same bytes at a different URL renders differently, so the multiset of contents isn't enough.
    directoryTreeRef.current = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['brand.svg'],
    };
    fileHashesRef.current = { '/repo/packages/ui/.storybook/static/brand.svg': 'A' };
    const after = await rollUp();

    expect(after.get('<staticFiles>')).not.toBe(before.get('<staticFiles>'));
  });

  it('moves the static roll-up when two assets swap contents', async () => {
    directoryTreeRef.current = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['a.png', 'b.png'],
    };
    const [a, b] = [
      '/repo/packages/ui/.storybook/static/a.png',
      '/repo/packages/ui/.storybook/static/b.png',
    ];
    fileHashesRef.current = { [a]: 'A', [b]: 'B' };
    const before = await rollUp();

    // The multiset of contents is identical, but each URL now serves the other's bytes.
    fileHashesRef.current = { [a]: 'B', [b]: 'A' };
    const after = await rollUp();

    expect(after.get('<staticFiles>')).not.toBe(before.get('<staticFiles>'));
  });

  it('moves the config roll-up when a config file is renamed without changing its bytes', async () => {
    directoryTreeRef.current = { '/repo/packages/ui/.storybook': ['preview-head.html'] };
    fileHashesRef.current = { '/repo/packages/ui/.storybook/preview-head.html': 'H' };
    const before = await rollUp();

    // Storybook loads config files by name, so the same bytes under a new name inject elsewhere.
    directoryTreeRef.current = { '/repo/packages/ui/.storybook': ['preview-body.html'] };
    fileHashesRef.current = { '/repo/packages/ui/.storybook/preview-body.html': 'H' };
    const after = await rollUp();

    expect(after.get('<storybookConfig>')).not.toBe(before.get('<storybookConfig>'));
  });

  it('omits a section that has no files, matching how the globals catch-all behaves', async () => {
    directoryTreeRef.current = { '/repo/packages/ui/.storybook': ['main.ts'] };

    const rollUps = await rollUp();

    expect(rollUps.has('<staticFiles>')).toBe(false);
  });

  it('keeps both roll-ups stable when the project moves, since path identity is project-relative', async () => {
    directoryTreeRef.current = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['logo.svg'],
    };
    fileHashesRef.current = {
      '/repo/packages/ui/.storybook/main.ts': 'M',
      '/repo/packages/ui/.storybook/static/logo.svg': 'A',
    };
    const before = await rollUp();

    directoryTreeRef.current = {
      '/repo/apps/web/.storybook': ['main.ts', 'static'],
      '/repo/apps/web/.storybook/static': ['logo.svg'],
    };
    fileHashesRef.current = {
      '/repo/apps/web/.storybook/main.ts': 'M',
      '/repo/apps/web/.storybook/static/logo.svg': 'A',
    };
    const after = await rollUp(input, '/repo/apps/web');

    expect(after.get('<storybookConfig>')).toBe(before.get('<storybookConfig>'));
    expect(after.get('<staticFiles>')).toBe(before.get('<staticFiles>'));
  });
});

async function rollUp(theInput: OutOfGraphInput = input, theProjectRoot = projectRoot) {
  return rollUpOutOfGraphFiles(await hashOutOfGraphFiles(theInput, theProjectRoot), h64ToString);
}
