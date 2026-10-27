import { DepGraph } from '@snyk/dep-graph';
import { createChangedPackagesGraph } from '@snyk/dep-graph';

/** The dependencies that differ between a dependency graph at HEAD and at a baseline. */
export interface BaselineChanges {
  /** The names of the changed packages. */
  names: Set<string>;
  /**
   * Every changed package, as `name@version`: the added, updated and removed ones, the packages on
   * the path from each of those to the root, and the ones some package now depends on in place of
   * another version. Unversioned packages are `name@`.
   */
  packages: Set<string>;
  /**
   * Names of the packages with a version installed at the baseline but no longer at HEAD. Whatever
   * loaded that version may now load another copy whose own version didn't change.
   */
  removedNames: Set<string>;
}

export const toPackageId = ({ name, version }: { name: string; version?: string }) =>
  `${name}@${version ?? ''}`;

// The packages that depend on each package, both as `name@version`. The root is ''.
function getParents(graph: DepGraph) {
  const { pkgs, graph: tree } = graph.toJSON();
  const pkgsById = new Map(pkgs.map(({ id, info }) => [id, info]));
  const pkgIdsByNode = new Map(tree.nodes.map(({ nodeId, pkgId }) => [nodeId, pkgId]));

  const parents = new Map<string, Set<string>>();
  for (const { nodeId, pkgId, deps } of tree.nodes) {
    const parent = pkgsById.get(pkgId);
    const parentId = nodeId === tree.rootNodeId || !parent ? '' : toPackageId(parent);
    for (const dep of deps) {
      const pkg = pkgsById.get(pkgIdsByNode.get(dep.nodeId) ?? '');
      if (!pkg) continue;
      const packageId = toPackageId(pkg);
      parents.set(packageId, (parents.get(packageId) ?? new Set()).add(parentId));
    }
  }
  return parents;
}

export const compareBaseline = async (
  headDependencies: DepGraph,
  baselineDependencies: DepGraph
): Promise<BaselineChanges> => {
  // createChangedPackagesGraph creates a graph of the dependencies that have changed between the
  // two dependency graphs but only finds removed dependencies based on the first graph argument.
  // Therefore, we need to run this twice to capture everything that changed. Each result also
  // holds the packages on the path from a changed one to the root, at their own versions.
  const changedPackagesFromBase = await createChangedPackagesGraph(
    baselineDependencies,
    headDependencies
  );

  const changedPackagesFromHead = await createChangedPackagesGraph(
    headDependencies,
    baselineDependencies
  );

  const changedPackages = [
    ...changedPackagesFromBase.getDepPkgs(),
    ...changedPackagesFromHead.getDepPkgs(),
  ];
  const names = new Set(changedPackages.map(({ name }) => name));
  const packages = new Set(changedPackages.map((pkg) => toPackageId(pkg)));

  // A version that was installed before can still be new to whatever depends on it now, such as
  // after a dedupe moves a package onto a copy another package already had, or when a package
  // switches between two versions that both stay installed. Only parents that were installed at
  // the baseline count: a parent at a new version is itself changed and traced.
  const baselineIds = new Set(baselineDependencies.getPkgs().map((pkg) => toPackageId(pkg)));
  const baselineParents = getParents(baselineDependencies);
  for (const [packageId, parents] of getParents(headDependencies)) {
    const before = baselineParents.get(packageId);
    const hasNewParent = [...parents].some(
      (id) => !before?.has(id) && (id === '' || baselineIds.has(id))
    );
    if (before && hasNewParent) packages.add(packageId);
  }

  const headPackages = new Set(headDependencies.getDepPkgs().map((pkg) => toPackageId(pkg)));
  const removedNames = new Set(
    baselineDependencies
      .getDepPkgs()
      .filter((pkg) => !headPackages.has(toPackageId(pkg)))
      .map(({ name }) => name)
  );

  return { names, packages, removedNames };
};
