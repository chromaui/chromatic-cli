import path from 'path';

import { Context, Stats } from '../../types';
import { normalizePath } from './getDependentStoryFiles';

// Strip a leading `./` so paths line up with the (git root relative) module paths in the stats.
const stripRelativePrefix = (filepath: string) => filepath.replace(/^\.\//, '');

/**
 * Given a list of changed package metadata files (manifests and/or lockfiles) which we could not
 * resolve to a concrete set of dependency changes, determine which of them are actually relevant
 * to the Storybook build.
 *
 * A package file is considered relevant if the build includes at least one module located within
 * the package file's directory. A package file at the repository root governs the entire project,
 * so it is always considered relevant. This lets us avoid bailing the whole build for an unrelated
 * (e.g. newly added) `package.json` belonging to a monorepo package that isn't part of Storybook.
 *
 * @param ctx The context set when executing the CLI.
 * @param stats The stats file information from the project's builder (Webpack, for example).
 * @param packageFiles The changed package metadata files we couldn't resolve to dependency changes.
 *
 * @returns The subset of `packageFiles` whose directory contains at least one module in the build.
 */
export const getPackageFilesInBuild = (
  ctx: Context,
  stats: Stats,
  packageFiles: string[]
): string[] => {
  const { rootPath = '' } = ctx.git || {};
  const { baseDir: baseDirectory = '' } = ctx.storybook || {};

  // Collect the git-root-relative path of every module in the build, including the constituent
  // modules of any concatenated (e.g. ModuleConcatenation) modules.
  const buildModulePaths = stats.modules.flatMap((module_) => [
    normalizePath(module_.name, rootPath, baseDirectory),
    ...(module_.modules?.map((m) => normalizePath(m.name, rootPath, baseDirectory)) || []),
  ]);

  return packageFiles.filter((file) => {
    const directory = path.posix.dirname(stripRelativePrefix(file));
    // A package file at the repository root governs the whole project, so always treat it as relevant.
    if (directory === '.' || directory === '') {
      return true;
    }

    const prefix = `${directory}/`;
    return buildModulePaths.some((modulePath) => modulePath.startsWith(prefix));
  });
};
