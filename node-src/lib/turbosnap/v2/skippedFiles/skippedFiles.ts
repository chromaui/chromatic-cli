import { AbsolutePath } from '../../../../types';
import { gitRootGlobMatcher, isNodeModulesPath } from '../paths';
import { ManifestInput } from '../projectFiles';

/**
 * The part of {@link ManifestInput} the skip rule reads: where the repository is, what the user
 * untraced, and how to ask git and the disk.
 */
export type SkipContext = Pick<ManifestInput, 'gitRoot' | 'untraced' | 'projectFiles'>;

/**
 * Why v2 skipped hashing a file. A skipped file's own bytes feed no roll-up either way; the reasons
 * differ in what happens to its imports. A gitignored file keeps its dependency edges, so a tracked
 * file imported through a generated barrel still rolls up into the story. An untraced file is a wall,
 * as in v1: its edges are severed too, so a change beneath it reaches a story only through another
 * import path; see `readStatsGraph`.
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
 * files git ignores anywhere in the repository (see {@link ignoredFileCheck}). Built once per
 * manifest, since it asks git once, and then answers synchronously for every file the graph and the
 * out-of-graph sweep hold.
 *
 * An `--untraced` glob is the user saying a file's changes should not recapture stories, so it is
 * honored wherever the file is: inside a dependency, since v1 lets a user untrace files inside a
 * package, and inside the Storybook config directory, since the documented recipe untraces the
 * global decorators kept there. The glob is matched as v1 matches it (see
 * {@link gitRootGlobMatcher}), so the one flag means the same thing in both. A file both untraced
 * and ignored is recorded as untraced, since that is the user's own say. Two files are out of the
 * rule's reach: an external, which v1 checks before it applies `--untraced`, and the main Storybook
 * config, which the config sweep hashes regardless; see `hashOutOfGraphFiles`.
 *
 * Every check is judged on the file a path leads to. A bundler may name a file through a symlinked
 * `node_modules` link, but git names the real file, and so does v1 when it matches `--untraced`,
 * since its paths come from git and the bundler; a glob written for v1 therefore spells the real
 * path, and matching anything else would hash a file the user untraced.
 *
 * @param context Where the repository is, what is untraced, and how to ask git and the disk.
 *
 * @returns The rule, by the path as given.
 */
export async function buildSkipRule(context: SkipContext): Promise<SkipRule> {
  const isUntraced = gitRootGlobMatcher(context.gitRoot, context.untraced);
  const isIgnoredFile = await ignoredFileCheck(context);

  return (absolutePath) => {
    const realPath = context.projectFiles.realPath(absolutePath);
    if (isUntraced(realPath)) return 'untraced';
    if (isIgnoredFile(realPath)) return 'gitignored';
    return undefined;
  };
}

/**
 * Builds the check for whether git ignores a real path. "Ignored" is git's answer; "skipped" is
 * our policy on top of it.
 *
 * We lean on git because generated files are often ignored by git and they can be non-deterministic.
 * Recapturing based on those hashing changes would be more "correct" but a much worse experience, so
 * we opted to match TurboSnap v1's behavior, which draws its changed files from `git diff` and never
 * sees a gitignored file either.
 *
 * Git's answer is taken for the whole repository, as v1 sees it: a file git ignores in any workspace
 * package is skipped, not just the Storybook package's own. The accepted cost: a workspace package
 * the graph holds only through its gitignored `dist` — the bundler resolves the `node_modules` link
 * to it, so its source never appears — is no longer hashed, which is v1's behavior today.
 * `--externals` does not rescue such a `dist`: `listExternalFiles` walks the git index, and git
 * never lists an ignored file, so a glob like `packages/icons/dist/**` matches nothing — the same
 * reason v1's `git diff` never sees the `dist`, which is why the flag needs no change. The hatch
 * that works is a glob on the sibling's tracked source: any change there recaptures Storybook-wide,
 * which detects changes to the built `dist` too.
 *
 * Two exceptions. `node_modules` keeps a real change visible: it is in nearly every `.gitignore`,
 * yet a dependency upgrade is a real change. The Storybook config directory gets no exemption: a
 * gitignored file there is generated like any other, and hashing it over-captures just the same;
 * the main config is the one file hashed regardless, by the config sweep; see
 * `hashOutOfGraphFiles`.
 *
 * The check takes a real path because that is how git names files; see
 * {@link ProjectFiles.ignoredPaths}.
 *
 * @param context Where the repository is, and how to ask git and the disk.
 *
 * @returns The check, by real path.
 */
async function ignoredFileCheck(
  context: SkipContext
): Promise<(realPath: AbsolutePath) => boolean> {
  const { projectFiles } = context;
  const ignored = await projectFiles.ignoredPaths();

  return (realPath) => !isNodeModulesPath(realPath) && ignored.has(realPath);
}
