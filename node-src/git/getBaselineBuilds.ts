import { localBuildsSpecifier } from '../lib/localBuildsSpecifier';
import { Context } from '../types';

/**
 * Get a list of baseline builds from the Index service
 *
 * @param ctx The context set when executing the CLI.
 * @param options Options to pass to the Index query.
 * @param options.branch The branch name.
 * @param options.parentCommits A list of parent commit hashes.
 *
 * @returns A list of baseline builds, if available.
 */
export async function getBaselineBuilds(
  ctx: Pick<Context, 'options' | 'ports' | 'git'>,
  { branch, parentCommits }: { branch: string; parentCommits: string[] }
) {
  return ctx.ports.chromatic.getBaselineBuilds({
    branch,
    parentCommits,
    localBuilds: localBuildsSpecifier(ctx),
  });
}
