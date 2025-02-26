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

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const diffGraph = await createChangedPackagesGraph(headDependencies, baselineDependencies!);
  diffGraph.getDepPkgs().map((pkg) => {
    changedDependencyNames.add(pkg.name);
  });
  return changedDependencyNames;

  // ctx.log.debug({ ...baselineConfig, baselineDependencies }, `Found baseline dependencies`);
  // for (const dependency of xor(baselineDependencies, headDependencies)) {
  //   // Strip the version number so we get a set of package names.
  //   changedDependencyNames.add(dependency.split('@@')[0]);
  // }
  // return changedDependencyNames;
};

// Retrieve a set of values which is in either set, but not both.
function xor<T>(left: Set<T>, right: Set<T>) {
  const result = new Set(left);

  for (const value of right.values()) {
    result.has(value) ? result.delete(value) : result.add(value);
  }

  return result;
}
