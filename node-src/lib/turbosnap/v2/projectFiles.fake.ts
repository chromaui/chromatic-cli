import path from 'path';

import { AbsolutePath } from '../../../types';
import { FileHash } from './graph';
import { ProjectFiles } from './projectFiles';

/**
 * A disk described as a value, for the in-memory adapter. Every field is optional, so a suite
 * describes only the part of the disk its assertion turns on.
 */
export interface InMemoryDisk {
  /** Entry names per absolute directory. A path a key exists for is a directory. */
  directories?: Record<AbsolutePath, string[]>;
  /** Content hash per absolute file path. A file with no entry here hashes as `x`. */
  fileHashes?: Record<AbsolutePath, FileHash>;
  /** Installed version per package name, whatever directory it is resolved from. */
  packageVersions?: Record<string, string>;
  /**
   * Whether a path has no file on disk. Everything else is a file, which is what keeps a suite from
   * having to list every source file its stats fixture names.
   */
  isAbsent?: (absolutePath: AbsolutePath) => boolean;
  /** Contents written by `writeFile`, keyed by absolute path, so a suite can read them back. */
  writtenFiles?: Record<AbsolutePath, string>;
}

/**
 * The adapter backed by a disk supplied as a value, so a suite describes its disk instead of mocking
 * `fs`. Symlinks, cycles and unreadable directories are not modelled: those are rules of the real
 * disk, and pinning them against a fake only proves the fake follows them. See projectFiles.test.ts,
 * which pins them against real temporary directories.
 *
 * @param disk The disk to read, read on each call so a test can set it after the adapter is
 * constructed.
 *
 * @returns The in-memory adapter.
 */
export function inMemoryProjectFiles(disk: InMemoryDisk): ProjectFiles {
  function isDirectory(absolutePath: AbsolutePath): boolean {
    return Boolean(disk.directories?.[absolutePath]);
  }

  function isFile(absolutePath: AbsolutePath): boolean {
    return !isDirectory(absolutePath) && !disk.isAbsent?.(absolutePath);
  }

  function listTree(absoluteDirectory: AbsolutePath): AbsolutePath[] {
    const entries = disk.directories?.[absoluteDirectory];
    if (!entries) {
      return [];
    }

    return entries.flatMap((name) => {
      const entryPath = path.join(absoluteDirectory, name);
      return disk.directories?.[entryPath] ? listTree(entryPath) : [entryPath];
    });
  }

  return {
    isFile,
    isDirectory,
    packageVersion: (_fromDirectory: AbsolutePath, packageName: string) =>
      disk.packageVersions?.[packageName],
    hashAll: async (absolutePaths: AbsolutePath[]) => {
      // The real reader throws for anything it cannot read, so refusing here too keeps the callers'
      // "don't hash a directory" guards honest: a suite that lost one sees this instead of a hash.
      const unreadable = absolutePaths.find((absolutePath) => !isFile(absolutePath));
      if (unreadable) {
        throw new Error(`Could not hash ${unreadable}`);
      }

      return Object.fromEntries(
        absolutePaths.map((absolutePath) => [absolutePath, disk.fileHashes?.[absolutePath] ?? 'x'])
      );
    },
    listTree,
    writeFile: (absolutePath: AbsolutePath, contents: string) => {
      disk.writtenFiles ??= {};
      disk.writtenFiles[absolutePath] = contents;
    },
  };
}
