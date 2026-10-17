import { execFileSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, vi } from 'vitest';

// The real adapter's whole job is knowing what the disk means, so its suites run against real
// temporary directories: real symlinks, a real cycle, a real unreadable directory, a real git
// repository. A fake that simulates those can only prove the fake follows them. Everything created
// here is removed after each test.
let temporaryDirectories: string[] = [];
let lockedDirectories: string[] = [];

// Git reads the machine's global and system config, whose excludes file could flip a result or make
// an `add` refuse a file, so both are pointed at nothing for the duration. And when a suite runs
// inside a git hook, the hook's repository-location variables would point every git command at that
// repository instead of a temporary one, so they are cleared too.
beforeEach(() => {
  vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
  vi.stubEnv('GIT_CONFIG_SYSTEM', '/dev/null');
  vi.stubEnv('GIT_DIR', undefined);
  vi.stubEnv('GIT_WORK_TREE', undefined);
  vi.stubEnv('GIT_INDEX_FILE', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
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

/**
 * Creates a temporary git repository. The root is the real path, not the link path the OS hands out
 * (on macOS the temp dir is itself a symlink), since git names paths from the real one.
 *
 * @returns The absolute path of the repository root.
 */
export function repository(): string {
  const root = realpathSync(temporaryDirectory());
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  return root;
}

/**
 * Writes a file and adds it to the git index, even when an ignore pattern matches it, so a suite
 * decides what is tracked independently of what it ignores.
 *
 * @param root The repository root.
 * @param relativePath The file's path relative to `root`.
 *
 * @returns The absolute path written.
 */
export function track(root: string, relativePath: string): string {
  const absolutePath = write(root, relativePath);
  execFileSync('git', ['add', '--force', relativePath], { cwd: root });
  return absolutePath;
}
