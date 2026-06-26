import {
  applyStorybookInfoOutput,
  extractStorybookInfoInput,
  setStorybookInfo,
} from '../tasks/storybookInfo';
import { Context } from '../types';
import { initial, pending, success } from '../ui/tasks/storybookInfo';
import { runTask } from './engine';
import { clackTaskLogRenderer } from './engine/clack/taskLogRenderer';
import { getRenderer } from './engine/getRenderer';

/**
 * Render the storybookInfo task.
 *
 * @param ctx The CLI context.
 */
export async function renderStorybookInfo(ctx: Context): Promise<void> {
  await runTask(
    ctx,
    {
      name: 'storybookInfo',
      // The title varies by build type (Storybook vs E2E test suite), so unlike other tasks it's
      // derived from ctx rather than hardcoded.
      title: initial(ctx).title,
      transitions: { pending, success },
      extractInput: extractStorybookInfoInput,
      run: setStorybookInfo,
      applyOutput: applyStorybookInfoOutput,
    },
    getRenderer(ctx, clackTaskLogRenderer)
  );
}
