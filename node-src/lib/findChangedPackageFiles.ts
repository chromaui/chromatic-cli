import { execGitCommand } from '../git/git';
import { isPackageMetadataFile } from './utils';

// TODO: refactor this function
// eslint-disable-next-line complexity
const isEqual = (left: unknown = {}, right: unknown = {}) => {
  if (typeof left !== typeof right) {
    return false;
  }

  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return left === right;
  }

  const entriesA = Object.entries(left).sort((a, b) => a[0].localeCompare(b[0]));
  const entriesB = Object.entries(right).sort((a, b) => a[0].localeCompare(b[0]));

  if (entriesA.length !== entriesB.length) {
    return false;
  }

  // depends on always having consistent ordering of keys
  for (let i = 0; i < entriesA.length; i++) {
    const [keyA, valueA] = entriesA[i];
    const [keyB, valueB] = entriesB[i];

    // values might be objects, so recursively compare
    if (keyA !== keyB || !isEqual(valueA, valueB)) {
      return false;
    }
  }

  return true;
};

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'dependenciesMeta',
  'peerDependenciesMeta',
  'overrides',
  'optionalDependencies',
  'resolutions',
  // most pnpm.* configs are dependency-related: https://pnpm.io/package_json#pnpmoverrides
  'pnpm',
];
export const arePackageDependenciesEqual = (
  packageJsonA: Record<string, unknown>,
  packageJsonB: Record<string, unknown>
) => dependencyFields.every((field) => isEqual(packageJsonA[field], packageJsonB[field]));

const fileCache = new Map<string, string>();
const readGitFile = async (fileName: string, commit = 'HEAD') => {
  const key = `${commit}:${fileName}`;
  if (fileCache.has(key)) return fileCache.get(key);
  const contents = await execGitCommand(`git show ${key}`);
  fileCache.set(key, contents);
  return contents;
};
export const clearFileCache = () => fileCache.clear();

// Filters a list of manifest files by whether they have dependency-related changes compared to
// their counterpart from another (baseline) commit.
const getManifestFilesWithChangedDependencies = async (manifestFiles: string[], commit: string) => {
  const withChangedDependencies = await Promise.all(
    manifestFiles.map(async (fileName) => {
      try {
        const base = await readGitFile(fileName, commit);
        const head = await readGitFile(fileName);
        return arePackageDependenciesEqual(JSON.parse(base), JSON.parse(head)) ? [] : [fileName];
      } catch (_err) {
        // Consider the dependencies changed if we failed to compare files.
        return [fileName];
      }
    })
  );
  return withChangedDependencies.flat();
};

// Yields a list of package.json files with dependency-related changes compared to the baseline.
export const findChangedPackageFiles = async (
  packageMetadataChanges: { changedFiles: string[]; commit: string }[]
) => {
  const changedManifestFiles = await Promise.all(
    packageMetadataChanges.map(({ changedFiles, commit }) => {
      const changedManifestFiles = changedFiles.filter(isPackageMetadataFile);
      if (!changedManifestFiles) return [];
      return getManifestFilesWithChangedDependencies(changedManifestFiles, commit);
    })
  );
  // Remove duplicate entries (in case multiple ancestor builds changed the same package.json)
  return Array.from(new Set(changedManifestFiles.flat()));
};
