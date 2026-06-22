import { applyPrepareOutput, extractPrepareInput, prepareProject } from '../tasks/prepare';
import { Context } from '../types';
import { initial, success, validating } from '../ui/tasks/prepare';
import { runTask } from './engine';
import { clackTaskLogRenderer } from './engine/clack/taskLogRenderer';
import { getRenderer } from './engine/getRenderer';

/**
 * Render the prepare task.
 *
 * @param ctx The CLI context.
 */
export async function renderPrepare(ctx: Context): Promise<void> {
  await runTask(
    ctx,
    {
      name: 'prepare',
      title: initial(ctx).title,
      transitions: { pending: validating, success },
      extractInput: extractPrepareInput,
      run: prepareProject,
      applyOutput: applyPrepareOutput,
    },
    getRenderer(ctx, clackTaskLogRenderer)
  );
}
