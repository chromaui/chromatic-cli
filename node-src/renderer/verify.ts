import { applyVerifyOutput, extractVerifyInput, verifyProject } from '../tasks/verify';
import { Context } from '../types';
import { dryRun, initial, pending, success } from '../ui/tasks/verify';
import { runTask } from './engine';
import { clackSpinnerRenderer } from './engine/clack/spinnerRenderer';
import { getRenderer } from './engine/getRenderer';

/**
 * Render the verify task.
 *
 * @param ctx The CLI context.
 */
export async function renderVerify(ctx: Context): Promise<void> {
  await runTask(
    ctx,
    {
      name: 'verify',
      title: initial(ctx).title,
      transitions: {
        pending,
        success,
        skipped: dryRun,
      },
      extractInput: extractVerifyInput,
      run: verifyProject,
      applyOutput: applyVerifyOutput,
    },
    getRenderer(ctx, clackSpinnerRenderer)
  );
}
