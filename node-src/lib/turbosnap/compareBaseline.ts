import { DepGraph } from '@snyk/dep-graph';
import { createChangedPackagesGraph } from '@snyk/dep-graph';

export const compareBaseline = async (
  headDependencies: DepGraph,
  baselineDependencies: DepGraph
) => {
  const changedDependencyNames = new Set<string>();

  // createChangedPackagesGraph creates a graph of the dependencies that have changed between the
  // two dependency graphs but only finds removed dependencies based on the first graph argument.
  // Therefore, we need to run this twice to capture everything that changed.
  const changedPackagesFromBase = await createChangedPackagesGraph(
    baselineDependencies,
    headDependencies
  );

  const changedPackagesFromHead = await createChangedPackagesGraph(
    headDependencies,
    baselineDependencies
  );

  for (const pkg of changedPackagesFromBase.getDepPkgs()) {
    changedDependencyNames.add(pkg.name);
  }

  for (const pkg of changedPackagesFromHead.getDepPkgs()) {
    changedDependencyNames.add(pkg.name);
  }

  return changedDependencyNames;
};
