import path from 'path';

import { AbsolutePath } from '../../../types';
import { ManifestInput } from './manifestInput';
import { isNodeModulesPath } from './paths';
import { ProjectFiles } from './projectFiles';

/**
 * The part of {@link ManifestInput} the skip rule reads: where the project and its config directory
 * are, and how to ask git and the disk.
 */
export type SkipContext = Pick<ManifestInput, 'projectRoot' | 'configDir' | 'projectFiles'>;

/**
 * Why v2 skipped hashing a file. Diagnostic only: it feeds no roll-up, so a file changing reason never
 * moves a hash. One value today; more are expected (such as untraced files).
 */
export type SkipReason = 'gitignored';

/**
 * The files among the given paths that TurboSnap v2 skips hashing: the project's own files that git
 * ignores. "Ignored" is git's answer; "skipped" is our policy on top of it.
 *
 * We lean on git because generated files are often ignored by git and they can be non-deterministic.
 * Recapturing based on those hashing changes would be more "correct" but a much worse experience, so
 * we opted to match TurboSnap v1's behavior.
 *
 * Only the project's own files are skipped, because a dependency's file is a real change however git
 * sees it. A workspace package's gitignored `dist` is the only form of that package the graph holds:
 * the bundler resolves the `node_modules` link to it, so its source never appears. The same goes for
 * `node_modules` itself, which is in nearly every `.gitignore`, yet a dependency upgrade is a real
 * change. And a generated `preview.*` in the Storybook config directory still shapes every story, so
 * the config directory is never skipped either.
 *
 * Every rule is judged on the file a path leads to, which is how git names files. A bundler names a
 * file by its real path while the project and config directories are named as configured, so a
 * `.storybook` that is a symlink would otherwise never match its own files.
 *
 * @param absolutePaths The paths to test.
 * @param context Where the project is, and how to ask git and the disk.
 *
 * @returns The subset of paths v2 skips, each with its {@link SkipReason}.
 */
export async function findSkippedFiles(
  absolutePaths: AbsolutePath[],
  context: SkipContext
): Promise<Map<AbsolutePath, SkipReason>> {
  const { projectFiles } = context;
  const projectRoot = projectFiles.realPath(context.projectRoot);
  const configDirectory = projectFiles.realPath(context.configDir) + path.sep;

  const realPaths = new Map(
    absolutePaths.map((absolutePath) => [absolutePath, projectFiles.realPath(absolutePath)])
  );
  const candidates = [...realPaths.values()].filter(
    (realPath) => !isNodeModulesPath(realPath) && !realPath.startsWith(configDirectory)
  );
  const ignored = await projectFiles.ignoredFiles(candidates);
  const isProjectDirectory = memoizedProjectDirectoryCheck(projectRoot, projectFiles);

  return new Map(
    [...realPaths]
      .filter(([, realPath]) => ignored.has(realPath) && isProjectDirectory(path.dirname(realPath)))
      .map(([absolutePath]): [AbsolutePath, SkipReason] => [absolutePath, 'gitignored'])
  );
}

/**
 * Builds the check for whether a directory is the project's own rather than a dependency's: it sits
 * under the project root with no `package.json` between. Memoized per directory, since the files
 * asked about cluster in a few directories and the walk up from each shares its ancestors.
 *
 * @param projectRoot The real path of the project root.
 * @param projectFiles How to read the disk.
 *
 * @returns The check, by real directory path.
 */
function memoizedProjectDirectoryCheck(
  projectRoot: AbsolutePath,
  projectFiles: ProjectFiles
): (directory: AbsolutePath) => boolean {
  const known = new Map<AbsolutePath, boolean>();

  const isProjectDirectory = (directory: AbsolutePath): boolean => {
    if (directory === projectRoot) return true;
    if (!directory.startsWith(projectRoot + path.sep)) return false;

    let answer = known.get(directory);
    if (answer === undefined) {
      answer =
        !projectFiles.isFile(path.join(directory, 'package.json')) &&
        isProjectDirectory(path.dirname(directory));
      known.set(directory, answer);
    }
    return answer;
  };

  return isProjectDirectory;
}
