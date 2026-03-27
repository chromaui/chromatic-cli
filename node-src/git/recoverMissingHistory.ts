import { Context } from '../types';
import { deepenFetchHistory, isShallowRepository } from './git';

/** Error thrown when Git history recovery fails during a deepen-fetch attempt. */
export class GitHistoryRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHistoryRecoveryError';
  }
}

const INITIAL_DEEPEN_BY = 50;
const MAX_TOTAL_DEEPEN = 6400;

/**
 * Attempts to recover missing Git history by deepening the fetch history.
 *
 * @param ctx - The context object containing git and log utilities.
 * @param getParentCommits - A function that returns a promise resolving to an array of parent commit SHAs.
 * @param initialParentCommits - Optional pre-fetched parent commits to use instead of calling getParentCommits.
 *
 * @returns A promise resolving to an array of parent commit SHAs.
 */
export async function recoverMissingHistory(
  ctx: Pick<Context, 'git' | 'log'>,
  getParentCommits: () => Promise<string[]>,
  initialParentCommits?: string[]
) {
  const parentCommits = initialParentCommits || (await getParentCommits());
  if (parentCommits.length > 0) {
    return parentCommits;
  }

  if (!(await isShallowRepository(ctx))) {
    ctx.git.historyRecovery = {
      status: 'skipped-not-shallow',
      attempts: [],
    };
    ctx.log.debug(
      'fetchMissingHistory enabled but repository is not shallow; skipping history recovery'
    );
    return parentCommits;
  }

  const attempts: NonNullable<Context['git']['historyRecovery']>['attempts'] = [];
  let deepenBy = INITIAL_DEEPEN_BY;
  let totalDepth = 0;

  while (totalDepth < MAX_TOTAL_DEEPEN) {
    const nextDepth = Math.min(deepenBy, MAX_TOTAL_DEEPEN - totalDepth);
    totalDepth += nextDepth;
    attempts.push({ deepenBy: nextDepth, totalDepth });

    ctx.log.info(
      `No ancestor build found; deepening Git history by ${nextDepth} commit(s) (${totalDepth}/${MAX_TOTAL_DEEPEN})`
    );

    try {
      await deepenFetchHistory(ctx, nextDepth);
    } catch (err) {
      const failureMessage = err instanceof Error ? err.message : String(err);
      ctx.git.historyRecovery = {
        status: 'failed',
        attempts,
        failureMessage,
      };
      throw new GitHistoryRecoveryError(failureMessage);
    }

    const recoveredParentCommits = await getParentCommits();
    if (recoveredParentCommits.length > 0) {
      ctx.git.historyRecovery = {
        status: 'recovered',
        attempts,
      };
      ctx.log.info(
        `Recovered ancestor build(s) after ${attempts.length} history fetch attempt${attempts.length === 1 ? '' : 's'}.`
      );
      return recoveredParentCommits;
    }

    deepenBy *= 2;
  }

  ctx.git.historyRecovery = {
    status: 'exhausted',
    attempts,
  };
  ctx.log.warn(
    `Unable to recover ancestor builds after fetching ${totalDepth} additional commit(s); continuing without recovered baselines.`
  );

  return parentCommits;
}
