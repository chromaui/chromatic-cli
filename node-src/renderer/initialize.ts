import { applyInitializeOutput, extractInitializeInput, initialize } from '../tasks/initialize';
import { Context } from '../types';
import { initial, pending, success } from '../ui/tasks/initialize';
import { runTask } from './engine';
import { clackTaskLogRenderer } from './engine/clack/taskLogRenderer';
import { getRenderer } from './engine/getRenderer';

/**
 * Render the initialize task.
 *
 * @param ctx The CLI context.
 */
export async function renderInitialize(ctx: Context): Promise<void> {
  await runTask(
    ctx,
    {
      name: 'initialize',
      title: initial.title,
      transitions: { pending, success },
      extractInput: extractInitializeInput,
      run: initialize,
      applyOutput: applyInitializeOutput,
    },
    getRenderer(ctx, clackTaskLogRenderer)
  );
}
