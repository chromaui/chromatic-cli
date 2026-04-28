import { AncestorBuild } from '../lib/ports/chromaticApi';
import { Context } from '../types';

/**
 * If we have a build who's commit no longer exists in the repository (likely a rebase/force-pushed
 * commit) or it had uncommitted changes, search for an ancestor build which has a clean commit.
 *
 * To do this we use the `Build.ancestorBuilds` API on the index, which will give us a set of builds
 * in reverse "git-chronological" order. That is, if we pick the first build that the API gives us
 * that has a commit, it is guaranteed to be the min number of builds "back" in Chromatic's history.
 *
 * The purpose here is to allow us to substitute a build with a known clean commit for TurboSnap.
 *
 * @param ctx The context set when executing the CLI.
 * @param ctx.ports The ports bundle within the context.
 * @param ctx.log The logger within the context.
 * @param buildNumber The build number to start searching from
 * @param options Page size and limit options
 * @param options.page How many builds to fetch each time
 * @param options.limit How many builds to gather per query.
 *
 * @returns A build to be substituted
 */
export async function findAncestorBuildWithCommit(
  ctx: Pick<Context, 'ports' | 'log'>,
  buildNumber: number,
  { page = 10, limit = 80 } = {}
): Promise<AncestorBuild | undefined> {
  let skip = 0;
  while (skip < limit) {
    const ancestorBuilds = await ctx.ports.chromatic.getAncestorBuilds({
      buildNumber,
      skip,
      limit: Math.min(page, limit - skip),
    });

    const results = await Promise.all(
      ancestorBuilds.map(async (build) => {
        const exists = await ctx.ports.git.commitExists(build.commit);
        return [build, exists] as const;
      })
    );
    const result = results.find(
      ([build, exists]) => !(build.isLocalBuild && build.uncommittedHash) && exists
    );

    if (result) return result[0];

    if (results.length < page) return;

    skip += page;
  }
  return;
}
