import { DepGraph } from '@snyk/dep-graph';
import { createChangedPackagesGraph } from '@snyk/dep-graph';

import { Context } from '../types';
import { getDependencies } from './getDependencies';

interface BaselineConfig {
  ref: string;
  rootPath: string;
  manifestPath: string;
  lockfilePath: string;
}

export const compareBaseline = async (
  ctx: Context,
  headDependencies: DepGraph,
  baselineConfig: BaselineConfig
) => {
  const changedDependencyNames = new Set<string>();
  const baselineDependencies = await getDependencies(ctx, baselineConfig);

  ctx.log.debug({ ...baselineConfig }, 'Found baseline dependencies');

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
