import {
  applyPrepareWorkspaceOutput,
  extractPrepareWorkspaceInput,
  runPrepareWorkspace,
} from '../tasks/prepareWorkspace';
import { Context } from '../types';
import { initial, pending, success } from '../ui/tasks/prepareWorkspace';
import { runTask } from './engine';
import { clackTaskLogRenderer } from './engine/clack/taskLogRenderer';
import { getRenderer } from './engine/getRenderer';

/**
 * Render the prepareWorkspace task.
 *
 * @param ctx The CLI context.
 */
export async function renderPrepareWorkspace(ctx: Context): Promise<void> {
  await runTask(
    ctx,
    {
      name: 'prepareWorkspace',
      title: initial.title,
      transitions: { pending, success },
      extractInput: extractPrepareWorkspaceInput,
      run: runPrepareWorkspace,
      applyOutput: applyPrepareWorkspaceOutput,
    },
    getRenderer(ctx, clackTaskLogRenderer)
  );
}
