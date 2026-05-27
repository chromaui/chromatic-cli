import { AncestorMissingError, BaselineDirtyError } from '../lib/turbosnap/errors';
import { Deps } from '../types';
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
 * pushed away) or the historical build had uncommitted changes, find the nearest ancestor build
 * that *does* have a valid commit, and return the differences along with the two builds (for
 * tracking purposes).
 *
 * @param deps Dependencies (log, client).
 * @param build The build details for gathering changed files.
 *
 * @returns A list of changed files for the build, adding a replacement build if necessary.
 */
export async function getChangedFilesWithReplacement(
  deps: Pick<Deps, 'log' | 'client'>,
  build: BuildWithCommitInfo
): Promise<{ changedFiles: string[]; replacementBuild?: BuildWithCommitInfo }> {
  try {
    if (build.isLocalBuild && build.uncommittedHash) {
      throw new BaselineDirtyError(build.commit);
    }

    const changedFiles = (await getChangedFiles(deps, build.commit)) || [];
    return { changedFiles };
  } catch (err) {
    deps.log.debug(
      `Got error fetching commit for #${build.number}(${build.commit}): ${err.message}`
    );

    if (err instanceof AncestorMissingError || err instanceof BaselineDirtyError) {
      const replacementBuild = await findAncestorBuildWithCommit(deps, build.number);

      if (replacementBuild) {
        deps.log.debug(
          `Found replacement build for #${build.number}(${build.commit}): #${replacementBuild.number}(${replacementBuild.commit})`
        );
        const changedFiles = (await getChangedFiles(deps, replacementBuild.commit)) || [];
        return { changedFiles, replacementBuild };
      }
      deps.log.debug(`Couldn't find replacement for #${build.number}(${build.commit})`);
    }

    throw err;
  }
}
