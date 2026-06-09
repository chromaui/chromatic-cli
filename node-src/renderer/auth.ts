import { applyAuthOutput, extractInput, runAuth } from '../tasks/auth';
import { Context } from '../types';
import { authenticated, authenticating } from '../ui/tasks/auth';
import { runTask } from './engine';
import { clackTaskLogRenderer } from './engine/clack/renderer';
import { getRenderer } from './engine/getRenderer';

/**
 * Render the auth task.
 *
 * @param ctx The CLI context.
 */
export async function renderAuth(ctx: Context): Promise<void> {
  await runTask(
    ctx,
    {
      name: 'auth',
      title: 'Authenticate',
      transitions: { pending: authenticating, success: authenticated },
      extractInput,
      run: runAuth,
      applyOutput: applyAuthOutput,
    },
    getRenderer(ctx, clackTaskLogRenderer)
  );
}
