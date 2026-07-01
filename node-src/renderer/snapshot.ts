import { applySnapshotOutput, extractSnapshotInput, snapshotProject } from '../tasks/snapshot';
import { Context } from '../types';
import { dryRun, initial, pending, skipped, success } from '../ui/tasks/snapshot';
import { runTask } from './engine';
import { clackProgressBarRenderer } from './engine/clack/progressRenderer';
import { getRenderer } from './engine/getRenderer';

/**
 * Render the snapshot task.
 *
 * @param ctx The CLI context.
 */
export async function renderSnapshot(ctx: Context): Promise<void> {
  await runTask(
    ctx,
    {
      name: 'snapshot',
      title: initial(ctx).title,
      transitions: {
        pending,
        success,
        // Two self-skip reasons share the one `skipped` transition: an upstream verify decision
        // (`ctx.skipSnapshots`: publish-only / --list / --exit-once-uploaded) vs. `--dry-run`.
        skipped: (context: Context) => (context.skipSnapshots ? skipped(context) : dryRun(context)),
      },
      extractInput: extractSnapshotInput,
      run: snapshotProject,
      applyOutput: applySnapshotOutput,
    },
    getRenderer(ctx, clackProgressBarRenderer)
  );
}
