import pLimit from 'p-limit';

import { BASELINE_FETCH_TIMEOUT_MILLISECONDS } from './constants';
import { execGitCommand, getGitTimeout, GitDeps } from './execGit';
import { getCloneDepth } from './git';

// One fetch at a time. Baseline recovery runs inside a Promise.all over the baseline builds
// (see gitInfo.ts), so several orphaned commits can be fetched at once. In a shallow clone,
// concurrent `git fetch --depth=1` calls contend for `.git/shallow.lock`, and a loser fails with
// "Unable to create '.../shallow.lock': File exists", which would read as an unrecoverable
// baseline rather than a clash.
const limitFetches = pLimit(1);

// Fetches that queue up together share one time budget, so an unreachable git host costs the
// build one timeout rather than one per orphaned baseline. A new budget starts whenever a fetch
// arrives with no other fetch queued or running.
let deadline = 0;

/**
 * Fetch a single commit from the `origin` remote by hash.
 *
 * A rebase or amend leaves a baseline build's commit orphaned: unreachable from every ref, so
 * no ordinary fetch restores it. Most Git hosts (GitHub included) still serve such commits when
 * requested by hash, so this is a last attempt to recover a baseline before falling back to a
 * replacement build.
 *
 * In a shallow clone, `--depth=1` bounds the transfer to the commit and its tree: diffing
 * against the baseline needs no ancestry, and an unbounded fetch could otherwise download all
 * missing history reachable from the orphaned commit. A full clone is fetched without a depth so
 * that no shallow graft is recorded, which could later truncate history if the commit became
 * reachable again (e.g. the branch is force-pushed back).
 *
 * The fetches in one batch get `BASELINE_FETCH_TIMEOUT_MILLISECONDS` between them (or the
 * configured `gitTimeout`, when shorter), not the `gitTimeout` each, which is sized for slow local
 * git in large repositories. A git host that silently drops traffic would otherwise stall the
 * build for the whole git timeout per baseline. On POSIX, a fetch that runs out of time is stopped
 * with SIGTERM rather than SIGKILL, so git removes its `shallow.lock` and later fetches in the
 * checkout still work.
 *
 * @param deps Function dependencies.
 * @param commit The commit hash to fetch.
 *
 * @returns True if the fetch succeeded.
 */
export async function fetchCommit(deps: GitDeps, commit: string) {
  // Git commands run through a shell, so only ever interpolate a well-formed commit hash.
  if (!/^[\da-f]{7,64}$/i.test(commit)) {
    deps.log.debug(`Not fetching invalid commit hash '${commit}'`);
    return false;
  }

  const budget = Math.min(getGitTimeout(deps.options), BASELINE_FETCH_TIMEOUT_MILLISECONDS);
  if (limitFetches.activeCount + limitFetches.pendingCount === 0) {
    deadline = Date.now() + budget;
  }

  return limitFetches(async () => {
    if (deadline <= Date.now()) {
      deps.log.debug(`Not fetching commit ${commit} from origin: out of time for baseline fetches`);
      return false;
    }
    const cancelSignal = AbortSignal.timeout(Math.max(deadline - Date.now(), 0));
    try {
      const depth = (await getCloneDepth(deps)) === 'shallow' ? ' --depth=1' : '';
      // `timeout: undefined` turns off execGitCommand's own `gitTimeout`, which would SIGKILL git.
      await execGitCommand(deps, `git fetch --no-tags${depth} origin "${commit}"`, {
        timeout: undefined,
        cancelSignal,
      });
      return true;
    } catch (error) {
      deps.log.debug(`Failed to fetch commit ${commit} from origin: ${error.message}`);
      // Judge from the signal, not the clock: a timer can fire a millisecond before Date.now()
      // reaches the deadline, which would let the next queued fetch start with no time left.
      if (cancelSignal.aborted) {
        deadline = 0;
        deps.log.info(
          `Couldn't fetch the missing TurboSnap baseline commit ${commit.slice(0, 7)} from origin within ${budget / 1000}s. ` +
            'Set CHROMATIC_TURBOSNAP_DISABLE_BASELINE_FETCH=true to skip this step.'
        );
      }
      return false;
    }
  });
}
