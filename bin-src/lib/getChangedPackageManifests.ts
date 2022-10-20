import { execGitCommand } from '../git/git';
import { isPackageManifestFile } from './utils';

export const getRawChangedManifests = (results) => {
  const packageManifestChanges: { commit: string; changedFiles: string[] }[] = [];

  results.forEach((resultItem) => {
    const changedPackageFiles = resultItem.changedFiles.filter((changedFile) =>
      isPackageManifestFile(changedFile)
    );

    if (changedPackageFiles.length) {
      packageManifestChanges.push({
        commit: resultItem.build.commit,
        changedFiles: changedPackageFiles,
      });
    }
  });

  return packageManifestChanges;
};

const compareObjects = (objA = {}, objB = {}) => {
  if (typeof objA !== typeof objB) {
    return false;
  }

  if (typeof objA !== 'object' || typeof objB !== 'object' || objA === null || objB === null) {
    return objA === objB;
  }

  const entriesA = Object.entries(objA).sort((a, b) => a[0].localeCompare(b[0]));
  const entriesB = Object.entries(objB).sort((a, b) => a[0].localeCompare(b[0]));

  if (entriesA.length !== entriesB.length) {
    return false;
  }

  // depends on always having consistent ordering of keys
  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < entriesA.length; i++) {
    const [keyA, valueA] = entriesA[i];
    const [keyB, valueB] = entriesB[i];

    // values might be objects, so recursively compare
    if (keyA !== keyB || !compareObjects(valueA, valueB)) {
      return false;
    }
  }

  return true;
};

export const arePackageDependenciesEqual = (packageObjA, packageObjB) => {
  const fields = [
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

  return fields.every((field) => compareObjects(packageObjA[field], packageObjB[field]));
};

const getSingleCommitChangedPackageManifests = async (
  commit: string,
  changedPackageFiles: string[]
): Promise<string[]> => {
  const allChanges = await Promise.all(
    changedPackageFiles.map(async (fileName) => {
      const fileA = await execGitCommand(`git show ${commit}:${fileName}`);
      const fileB = await execGitCommand(`git show HEAD:${fileName}`);

      const areDependenciesEqual = arePackageDependenciesEqual(
        JSON.parse(fileA),
        JSON.parse(fileB)
      );

      // put in empty entry for equal-dependency packages so we only have fileNames for the non-equal ones
      return areDependenciesEqual ? [] : [fileName];
    })
  );

  return allChanges.flat();
};

export const getChangedPackageManifests = async (packageManifestChanges) => {
  const changedFileNames = await Promise.all(
    packageManifestChanges.map(async ({ commit, changedFiles }) => {
      return getSingleCommitChangedPackageManifests(commit, changedFiles);
    })
  );

  const flattenedChanges = changedFileNames.flat();
  // remove duplicate entries (if have multiple ancestors and both changed the same package.json, for example)
  return Array.from(new Set(flattenedChanges));
};
