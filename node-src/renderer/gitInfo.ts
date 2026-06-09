import {
  applyGitInfoOutput,
  applyGitInfoPartial,
  extractGitInfoInput,
  gatherGitInfo,
} from '../tasks/gitInfo';
import { Context } from '../types';
import { pending, skippedForCommit, skippedRebuild, success } from '../ui/tasks/gitInfo';
import { runTask } from './engine';
import { clackTaskLogRenderer } from './engine/clack/renderer';
import { getRenderer } from './engine/getRenderer';

/**
 * Render the gitInfo task.
 *
 * @param ctx The CLI context.
 */
export async function renderGitInfo(ctx: Context): Promise<void> {
  await runTask(
    ctx,
    {
      name: 'gitInfo',
      title: 'Retrieve git information',
      transitions: {
        pending,
        success,
        partial: (ctx, partial) =>
          partial.phase === 'skip-commit' ? skippedForCommit(ctx) : skippedRebuild(),
      },
      extractInput: extractGitInfoInput,
      run: gatherGitInfo,
      applyOutput: applyGitInfoOutput,
      applyPartial: applyGitInfoPartial,
    },
    getRenderer(ctx, clackTaskLogRenderer)
  );
}
