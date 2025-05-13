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

    if (/(bad object|uncommitted changes)/.test(err.message) || err.timedOut) {
      const replacementBuild = await findAncestorBuildWithCommit(ctx, build.number);

      if (replacementBuild) {
        ctx.log.debug(
          `Found replacement build for #${build.number}(${build.commit}): #${replacementBuild.number}(${replacementBuild.commit})`
        );
        const changedFiles = (await getChangedFiles(replacementBuild.commit)) || [];
        return { changedFiles, replacementBuild };
      }
      ctx.log.debug(`Couldn't find replacement for #${build.number}(${build.commit})`);
    }

    // If we can't find a replacement or the error doesn't match, just throw
    throw err;
  }
}
