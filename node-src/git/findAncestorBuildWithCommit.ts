import gql from 'fake-tag';

import { Context } from '../types';
import { commitExists } from './git';

const AncestorBuildsQuery = gql`
  query AncestorBuildsQuery($buildNumber: Int!, $skip: Int!, $limit: Int!) {
    app {
      build(number: $buildNumber) {
        ancestorBuilds(skip: $skip, limit: $limit) {
          id
          number
          commit
          uncommittedHash
          isLocalBuild
        }
      }
    }
  }
`;

export interface AncestorBuildsQueryResult {
  app: {
    build: {
      ancestorBuilds: {
        id: string;
        number: number;
        commit: string;
        uncommittedHash: string;
        isLocalBuild: boolean;
      }[];
    };
  };
}

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
 * @param ctx.client The GraphQL client within the context.
 * @param ctx.log The logger within the context.
 * @param buildNumber The build number to start searching from
 * @param options Page size and limit options
 * @param options.page How many builds to fetch each time
 * @param options.limit How many builds to gather per query.
 *
 * @returns A build to be substituted
 */
export async function findAncestorBuildWithCommit(
  ctx: Pick<Context, 'client' | 'log'>,
  buildNumber: number,
  { page = 10, limit = 80 } = {}
): Promise<AncestorBuildsQueryResult['app']['build']['ancestorBuilds'][0] | undefined> {
  let skip = 0;
  while (skip < limit) {
    const { app } = await ctx.client.runQuery<AncestorBuildsQueryResult>(AncestorBuildsQuery, {
      buildNumber,
      skip,
      limit: Math.min(page, limit - skip),
    });

    const results = await Promise.all(
      app.build.ancestorBuilds.map(async (build) => {
        const exists = await commitExists(ctx, build.commit);
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
