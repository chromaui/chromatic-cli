import { isPackageMetadataFile } from './utils';

/**
 * Determines whether a given changed file is relevant to the current Storybook project scope.
 *
 * In a monorepo, `git diff --name-only` returns ALL changed files across the entire repository.
 * When the Storybook project lives in a subdirectory (e.g., `web/`), most of those changes are
 * irrelevant and cause unnecessary TurboSnap processing — traversing potentially hundreds of
 * thousands of files for dependency tracing, package metadata analysis, and bail-condition checks.
 *
 * This filter keeps only files that:
 *   1. Are under the Storybook project's `baseDir` (e.g., `web/src/foo.js`)
 *   2. Are root-level package metadata (e.g., `package.json`, `yarn.lock` at the repo root)
 *      which can affect any workspace via hoisted dependencies
 *
 * Files outside the scoped directory that are actual transitive dependencies (e.g.,
 * `shared-ui/src/Button.tsx` imported by `web/`) will be recovered later via the stats
 * module allowlist in `traceChangedFiles`.
 *
 * @param baseDir The Storybook base directory relative to the git root (e.g., `"web"`, `"packages/app"`).
 *   If `.` or empty, no filtering is applied.
 * @param changedFiles The full list of git-root-relative changed file paths.
 *
 * @returns The filtered list of changed files relevant to this Storybook project scope.
 */
export function filterChangedFilesByBaseDir(baseDir: string, changedFiles: string[]): string[] {
  // If baseDir is trivial (repo root), no filtering needed
  if (!baseDir || baseDir === '.' || baseDir === './') {
    return changedFiles;
  }

  // Normalize baseDir to ensure it has a trailing slash for prefix matching
  const prefix = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;

  return changedFiles.filter((file) => {
    // Keep files under the Storybook project directory
    if (file.startsWith(prefix)) return true;

    // Keep root-level package metadata files (no directory separator = repo root)
    // These contain hoisted dependencies that can affect any workspace
    if (!file.includes('/') && isPackageMetadataFile(file)) return true;

    return false;
  });
}

/**
 * Filters package metadata changes to only include those relevant to the current scope.
 *
 * @param baseDir The Storybook base directory relative to the git root.
 * @param packageMetadataChanges The full list of package metadata change sets.
 *
 * @returns Filtered package metadata changes with only relevant files.
 */
export function filterPackageMetadataByBaseDir(
  baseDir: string,
  packageMetadataChanges: { changedFiles: string[]; commit: string }[]
): { changedFiles: string[]; commit: string }[] {
  if (!baseDir || baseDir === '.' || baseDir === './') {
    return packageMetadataChanges;
  }

  const prefix = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;

  return packageMetadataChanges
    .map(({ changedFiles, commit }) => ({
      changedFiles: changedFiles.filter(
        (file) =>
          // Keep files under the project directory
          file.startsWith(prefix) ||
          // Keep root-level metadata files
          !file.includes('/')
      ),
      commit,
    }))
    .filter(({ changedFiles }) => changedFiles.length > 0);
}
