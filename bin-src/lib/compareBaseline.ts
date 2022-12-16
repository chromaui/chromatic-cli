import { Context } from '../types';
import { getDependencies } from './getDependencies';

// Retrieve a set of values which is in either set, but not both.
const xor = <T>(left: Set<T>, right: Set<T>) =>
  Array.from(right.values()).reduce((acc, value) => {
    if (acc.has(value)) acc.delete(value);
    else acc.add(value);
    return acc;
  }, new Set(left));

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
  // eslint-disable-next-line no-restricted-syntax
  for (const dependency of xor(baselineDependencies, headDependencies)) {
    // Strip the version number so we get a set of package names.
    changedDependencyNames.add(dependency.split('@@')[0]);
  }
  return changedDependencyNames;
};
