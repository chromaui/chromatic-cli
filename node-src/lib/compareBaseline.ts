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
  headDependencies: Set<string>,
  baselineConfig: BaselineConfig
) => {
  const changedDependencyNames = new Set<string>();
  const baselineDependencies = await getDependencies(ctx, baselineConfig);

  ctx.log.debug({ ...baselineConfig, baselineDependencies }, `Found baseline dependencies`);
  for (const dependency of xor(baselineDependencies, headDependencies)) {
    // Strip the version number so we get a set of package names.
    changedDependencyNames.add(dependency.split('@@')[0]);
  }
  return changedDependencyNames;
};

// Retrieve a set of values which is in either set, but not both.
function xor<T>(left: Set<T>, right: Set<T>) {
  const result = new Set(left);

  for (const value of right.values()) {
    result.has(value) ? result.delete(value) : result.add(value);
  }

  return result;
}
