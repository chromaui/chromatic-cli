import { getChangedFiles } from './git';
import { findAncestorBuildWithCommit } from './findAncestorBuildWithCommit';
import { Context } from '../types';

type BuildWithCommit = {
  id: string;
  number: number;
  commit: string;
};

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
  build: BuildWithCommit
): Promise<{ changedFiles: string[]; replacementBuild?: BuildWithCommit }> {
  try {
    const changedFiles = await getChangedFiles(build.commit);
    return { changedFiles };
  } catch (err) {
    if (err.message.match(/unknown revision/)) {
      const replacementBuild = await findAncestorBuildWithCommit(context, build.number);

      if (replacementBuild) {
        const changedFiles = await getChangedFiles(replacementBuild.commit);
        return { changedFiles, replacementBuild };
      }
    }

    // If we can't find a replacement or the error doesn't match, just throw
    throw err;
  }
}
