import { Context } from '../types';
import { findAncestorBuildWithCommit } from './findAncestorBuildWithCommit';
import { getChangedFiles } from './git';

interface BuildWithCommitInfo {
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
 */
export async function getChangedFilesWithReplacement(
  context: Context,
  build: BuildWithCommitInfo
): Promise<{ changedFiles: string[]; replacementBuild?: BuildWithCommitInfo }> {
  try {
    if (build.isLocalBuild && build.uncommittedHash) {
      throw new Error('Local build had uncommitted changes');
    }

    const changedFiles = await getChangedFiles(build.commit);
    return { changedFiles };
  } catch (err) {
    context.log.debug(
      `Got error fetching commit for #${build.number}(${build.commit}): ${err.message}`
    );

    if (/(bad object|uncommitted changes)/.test(err.message)) {
      const replacementBuild = await findAncestorBuildWithCommit(context, build.number);

      if (replacementBuild) {
        context.log.debug(
          `Found replacement build for #${build.number}(${build.commit}): #${replacementBuild.number}(${replacementBuild.commit})`
        );
        const changedFiles = await getChangedFiles(replacementBuild.commit);
        return { changedFiles, replacementBuild };
      }
      context.log.debug(`Couldn't find replacement for #${build.number}(${build.commit})`);
    }

    // If we can't find a replacement or the error doesn't match, just throw
    throw err;
  }
}
