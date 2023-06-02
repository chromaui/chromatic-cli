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
      }[];
    };
  };
}

/**
 * If we have a build who's commit no longer exists in the repository (likely a rebase/force-pushed
 * commit), search for an ancestor build which *does* have one.
 *
 * To do this we use the `Build.ancestorBuilds` API on the index, which will give us a set of builds
 * in reverse "git-chronological" order. That is, if we pick the first build that the API gives us
 * that has a commit, it is guaranteed to be the min number of builds "back" in Chromatic's history.
 *
 * The purpose here is to allow us to substitute a build with a known commit when doing TurboSnap.
 *
 * @param {Context} context
 * @param {int} number The build number to start searching from
 * @param {object} options Page size and limit options
 * @param {int} options.page How many builds to fetch each time
 * @param {int} options.steps How far back to look
 *
 * @returns {Build | void} A build to be substituted
 * */
export async function findAncestorBuildWithCommit(
  { client }: Pick<Context, 'client'>,
  buildNumber: number,
  { page = 10, limit = 80 } = {}
): Promise<AncestorBuildsQueryResult['app']['build']['ancestorBuilds'][0] | void> {
  let skip = 0;
  while (skip < limit) {
    // @ts-expect-error runQuery is not typed
    // eslint-disable-next-line no-await-in-loop
    const { app } = await client.runQuery(AncestorBuildsQuery, {
      buildNumber,
      skip,
      limit: Math.min(page, limit - skip),
    });

    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      app.build.ancestorBuilds.map(async (build) => [build, await commitExists(build.commit)])
    );
    const result = results.find(([build, exists]) => exists);

    if (result) return result[0];

    if (results.length < page) return null;

    skip += page;
  }
  return null;
}
