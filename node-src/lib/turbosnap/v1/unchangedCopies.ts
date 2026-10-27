import { BaselineChanges, toPackageId } from './compareBaseline';
import { VersionLookup } from './lockfileVersions';

/**
 * Tells whether an installed copy of a changed dependency is at a version that didn't change.
 *
 * @param directory The copy's repository-relative `node_modules/<name>` directory.
 * @param name The package name.
 */
export type IsUnchangedCopy = (directory: string, name: string) => boolean;

/**
 * Works out which installed versions a copy may be skipped at: versions installed at HEAD that
 * didn't change since any baseline. Whatever loaded a removed version may now load another copy
 * that looks unchanged, so a name with a removed version has no skippable versions at all.
 *
 * @param headPackages The packages the diffed pairs install at HEAD.
 * @param changes The changes since every baseline.
 *
 * @returns The skippable packages as `name@version`.
 */
export function getSkippablePackages(
  headPackages: { name: string; version?: string }[],
  changes: Pick<BaselineChanges, 'packages' | 'removedNames'>[]
) {
  const changedPackages = new Set(changes.flatMap(({ packages }) => [...packages]));
  const removedNames = new Set(changes.flatMap(({ removedNames }) => [...removedNames]));
  return new Set(
    headPackages
      .filter((pkg) => !changedPackages.has(toPackageId(pkg)) && !removedNames.has(pkg.name))
      .map((pkg) => toPackageId(pkg))
  );
}

/**
 * Builds the check that lets the tracer skip a copy of a changed dependency whose own version
 * didn't change. A copy is only skipped when `versions` can tell its version and it's one of
 * `skippablePackages`. Anything else is traced, as it was before versions were taken into account.
 *
 * @param versions Looks up the trustworthy versions of installed copies.
 * @param skippablePackages The `name@version` of the packages whose copies may be skipped.
 *
 * @returns The check.
 */
export function getUnchangedCopyCheck(
  versions: VersionLookup,
  skippablePackages: Set<string>
): IsUnchangedCopy {
  // Thousands of modules share a few hundred package directories, so look at each one once.
  const versionsByDirectory = new Map<string, string | undefined>();
  return (directory, name) => {
    if (!versionsByDirectory.has(directory)) {
      versionsByDirectory.set(directory, versions.findVersion(directory, name));
    }
    const version = versionsByDirectory.get(directory);
    return version !== undefined && skippablePackages.has(toPackageId({ name, version }));
  };
}
