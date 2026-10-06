import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach } from 'vitest';

// The real adapter's whole job is knowing what the disk means, so its suites run against real
// temporary directories: real symlinks, a real cycle, a real unreadable directory, a real git
// repository. A fake that simulates those can only prove the fake follows them. Everything created
// here is removed after each test.
let temporaryDirectories: string[] = [];
let lockedDirectories: string[] = [];

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
export function temporaryDirectory(): string {
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
export function write(root: string, relativePath: string, content = relativePath): string {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
  return absolutePath;
}

/**
 * Updates the permissions of the path so it's unreadable, so a test can test failed read
 * operations.
 *
 * @param absolutePath The file or directory to lock.
 */
export function lock(absolutePath: string) {
  lockedDirectories.push(absolutePath);
  chmodSync(absolutePath, 0o000);
}
