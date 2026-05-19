import { applyAuthOutput, extractInput, runAuth } from '../tasks/auth';
import { Context } from '../types';
import { authenticated, authenticating } from '../ui/tasks/auth';
import { clackTaskLogRenderer } from './engine/clack/renderer';
import { runTask } from './engine/interface';

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
      transitions: { pending: authenticating, success: authenticated },
      extractInput,
      run: runAuth,
      applyOutput: applyAuthOutput,
    },
    clackTaskLogRenderer()
  );
}
