// The `vi.mock` factories the manifest suites share. Kept free of imports so a factory can pull them
// in dynamically without dragging the module under test into its own mock.

/** A mutable box a hoisted `vi.mock` factory can read, so each test controls what it returns. */
export interface Reference<T> {
  current: T;
}

/**
 * The `getFileHashes` mock. It is called with absolute paths and returns hashes keyed by those
 * paths, so tests set the content hash per absolute file path and unset files hash as `x`.
 *
 * @param fileHashes The hash per absolute file path.
 *
 * @returns The mocked module.
 */
export function fileHashesModule(fileHashes: Reference<Record<string, string>>) {
  return {
    getFileHashes: (files: string[]) => {
      // A trailing slash names a directory, which the real reader rejects; see the EISDIR guard in
      // manifest.ts. Rejecting here too keeps the guard's test honest.
      const directory = files.find((f) => f.endsWith('/'));
      if (directory) {
        return Promise.reject(new Error(`EISDIR: illegal operation on a directory, read`));
      }
      return Promise.resolve(
        Object.fromEntries(files.map((f) => [f, fileHashes.current[f] ?? 'x']))
      );
    },
  };
}

/**
 * The `fs/promises` sweep mock. The config and static directories are swept off disk, which no
 * fixture has, so the sweep is backed by an in-memory tree of absolute directory -> entry names;
 * see outOfGraphFiles.test.ts for the sweep's own behaviour.
 *
 * @param directoryTree The entry names per absolute directory.
 *
 * @returns The mocked module's overrides, to spread over the original module.
 */
export function directoryTreeModule(directoryTree: Reference<Record<string, string[]>>) {
  return {
    readdir: (directory: string) => {
      const entries = directoryTree.current[directory];
      if (!entries) return Promise.reject(new Error(`ENOENT: ${directory}`));
      return Promise.resolve(
        entries.map((name) => ({
          name,
          isDirectory: () => Boolean(directoryTree.current[`${directory}/${name}`]),
          isFile: () => !directoryTree.current[`${directory}/${name}`],
        }))
      );
    },
    // The sweep resolves each directory before walking it, to terminate on a symlink cycle. This tree
    // has no symlinks, so every path is already real — but a missing directory must still reject.
    realpath: async (directory: string) => {
      if (!directoryTree.current[directory]) throw new Error(`ENOENT: ${directory}`);
      return directory;
    },
  };
}
