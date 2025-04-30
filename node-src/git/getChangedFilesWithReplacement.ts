import { Context } from '../types';
import { findAncestorBuildWithCommit } from './findAncestorBuildWithCommit';
import { getChangedFiles } from './git';

export interface BuildWithCommitInfo {
  id: string;
  number: number;
  commit: string;
  uncommittedHash: string;
  isLocalBuild: boolean;
}

/**
 * Find the set of files that have changed (according to git) between the historical build's commit
 * and the current commit.
 *
 * If the historical build's commit doesn't exist (for instance if it has been rebased and force-
 * pushed away), find the nearest ancestor build that *does* have a valid commit, and return
 * the differences, along with the two builds (for tracking purposes).
 *
 * @param ctx The context set when executing the CLI.
 * @param build The build details for gathering changed files.
 *
 * @returns A list of changed files for the build, adding a replacement build if necessary.
 */
export async function getChangedFilesWithReplacement(
  ctx: Context,
  build: BuildWithCommitInfo
): Promise<{ changedFiles: string[]; replacementBuild?: BuildWithCommitInfo }> {
  try {
    if (build.isLocalBuild && build.uncommittedHash) {
      throw new Error('Local build had uncommitted changes');
    }

    const changedFiles = (await getChangedFiles(build.commit)) || [];
    return { changedFiles };
  } catch (err) {
    ctx.log.debug(
      `Got error fetching commit for #${build.number}(${build.commit}): ${err.message}`
    );

    if (!/(bad object|uncommitted changes)/.test(err.message)) {
      throw err;
    }

    // Try to find a replacement build by checking multiple ancestor builds
    let skip = 0;
    const page = 10;
    const limit = 80;

    while (skip < limit) {
      const replacementBuild = await findAncestorBuildWithCommit(ctx, build.number, {
        page,
        limit: Math.min(page, limit - skip),
      });

      if (!replacementBuild) {
        break;
      }

      try {
        ctx.log.debug(
          `Found replacement build for #${build.number}(${build.commit}): #${replacementBuild.number}(${replacementBuild.commit})`
        );
        const changedFiles = (await getChangedFiles(replacementBuild.commit)) || [];
        return { changedFiles, replacementBuild };
      } catch (error) {
        ctx.log.debug(
          `Error with replacement build #${replacementBuild.number}(${replacementBuild.commit}): ${error.message}`
        );
        // Continue to next potential replacement build
        skip += page;
      }
    }

    ctx.log.debug(`Couldn't find a working replacement for #${build.number}(${build.commit})`);
    throw err;
  }
}
