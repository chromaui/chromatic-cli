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
