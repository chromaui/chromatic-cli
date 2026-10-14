import path from 'path';

import { AbsolutePath } from '../../../types';
import { ManifestInput } from './manifestInput';
import { gitRootGlobMatcher, isNodeModulesPath } from './paths';
import { ProjectFiles } from './projectFiles';

/**
 * The part of {@link ManifestInput} the skip rule reads: where the project, its config directory and
 * the repository are, what the user untraced, and how to ask git and the disk.
 */
export type SkipContext = Pick<
  ManifestInput,
  'projectRoot' | 'configDir' | 'gitRoot' | 'untraced' | 'projectFiles'
>;

/**
 * Why v2 skipped hashing a file. Diagnostic only: it feeds no roll-up, so a file changing reason never
 * moves a hash.
 */
export type SkipReason = 'gitignored' | 'untraced';

/**
 * Why TurboSnap v2 skips hashing the file at a path, or undefined when it hashes the file; see
 * {@link buildSkipRule}.
 */
export type SkipRule = (absolutePath: AbsolutePath) => SkipReason | undefined;

/**
 * Splits paths by the rule: the ones to hash, and the ones skipped with their reason. The one place
 * the rule is applied to a listing, so the graph and the static sweep partition alike.
 *
 * @param absolutePaths The paths to split.
 * @param rule The rule to split them by; see {@link buildSkipRule}.
 *
 * @returns The paths to hash, in the order given, and the skipped paths with their reasons.
 */
export function partitionSkipped(
  absolutePaths: Iterable<AbsolutePath>,
  rule: SkipRule
): { hashable: AbsolutePath[]; skipped: Map<AbsolutePath, SkipReason> } {
  const hashable: AbsolutePath[] = [];
  const skipped = new Map<AbsolutePath, SkipReason>();
  for (const absolutePath of absolutePaths) {
    const reason = rule(absolutePath);
    if (reason) {
      skipped.set(absolutePath, reason);
    } else {
      hashable.push(absolutePath);
    }
  }
  return { hashable, skipped };
}

/**
 * Builds the rule for which files TurboSnap v2 skips hashing: the files the user untraced, and the
 * project's own files that git ignores (see {@link ignoredProjectFileCheck}). Built once per
 * manifest, since it asks git once, and then answers synchronously for every file the graph and the
 * static sweep hold.
 *
 * An `--untraced` glob is the user saying a file's changes should not recapture stories, so it is
 * honored wherever the file is, a dependency included: v1 lets a user untrace files inside a package.
 * The glob is matched as v1 matches it (see {@link gitRootGlobMatcher}), so the one flag means the
 * same thing in both. A file both untraced and ignored is recorded as untraced, since that is the
 * user's own say.
 *
 * The Storybook config directory is never skipped by either rule. A generated `preview.*` there
 * still shapes every story, and the config sweep hashes the directory's bytes regardless, so skipping
 * a config file in the graph would change nothing while the sweep still saw the edit.
 *
 * A glob is matched against the path as given, which is the path the user sees, while the config
 * directory and the git rule are judged on the file a path leads to: a bundler names a file by its
 * real path while the project and config directories are named as configured.
 *
 * @param context Where the project and repository are, what is untraced, and how to ask git and
 * the disk.
 *
 * @returns The rule, by the path as given.
 */
export async function buildSkipRule(context: SkipContext): Promise<SkipRule> {
  const { projectFiles } = context;
  const configDirectory = projectFiles.realPath(context.configDir) + path.sep;
  const isUntraced = gitRootGlobMatcher(context.gitRoot, context.untraced);
  const isIgnoredProjectFile = await ignoredProjectFileCheck(context);

  return (absolutePath) => {
    const realPath = projectFiles.realPath(absolutePath);
    if (realPath.startsWith(configDirectory)) return undefined;
    if (isUntraced(absolutePath)) return 'untraced';
    if (isIgnoredProjectFile(realPath)) return 'gitignored';
    return undefined;
  };
}

/**
 * Builds the check for whether a real path is one of the project's own files that git ignores.
 * "Ignored" is git's answer; "skipped" is our policy on top of it.
 *
 * We lean on git because generated files are often ignored by git and they can be non-deterministic.
 * Recapturing based on those hashing changes would be more "correct" but a much worse experience, so
 * we opted to match TurboSnap v1's behavior.
 *
 * Only the project's own files qualify, because a dependency's file is a real change however git
 * sees it. A workspace package's gitignored `dist` is the only form of that package the graph holds:
 * the bundler resolves the `node_modules` link to it, so its source never appears. The same goes for
 * `node_modules` itself, which is in nearly every `.gitignore`, yet a dependency upgrade is a real
 * change; it gets its own check because a cache such as `node_modules/.vite` has no `package.json`
 * between it and the project root.
 *
 * The check takes a real path because that is how git names files; see
 * {@link ProjectFiles.ignoredPaths}.
 *
 * @param context Where the project is, and how to ask git and the disk.
 *
 * @returns The check, by real path.
 */
async function ignoredProjectFileCheck(
  context: SkipContext
): Promise<(realPath: AbsolutePath) => boolean> {
  const { projectFiles } = context;
  const projectRoot = projectFiles.realPath(context.projectRoot);
  const ignored = await projectFiles.ignoredPaths();
  const isProjectDirectory = memoizedProjectDirectoryCheck(projectRoot, projectFiles);

  return (realPath) =>
    !isNodeModulesPath(realPath) &&
    ignored.has(realPath) &&
    isProjectDirectory(path.dirname(realPath));
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
