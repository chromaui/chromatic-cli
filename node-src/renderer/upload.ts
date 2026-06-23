import { applyUploadOutput, extractUploadInput, uploadProject } from '../tasks/upload';
import { Context } from '../types';
import { dryRun, initial, starting, success } from '../ui/tasks/upload';
import { fallbackFailureState, runTask } from './engine';
import { clackProgressBarRenderer } from './engine/clack/progressRenderer';
import { getRenderer } from './engine/getRenderer';

/**
 * Render the upload task.
 *
 * @param ctx The CLI context.
 */
export async function renderUpload(ctx: Context): Promise<void> {
  await runTask(
    ctx,
    {
      name: 'upload',
      title: initial(ctx).title,
      transitions: {
        pending: starting,
        success,
        skipped: dryRun,
        failure: (context: Context, error: Error) =>
          fallbackFailureState(
            context.isReactNativeApp
              ? 'Publishing your built React Native Storybook'
              : starting(context).title,
            error
          ),
      },
      extractInput: extractUploadInput,
      run: uploadProject,
      applyOutput: applyUploadOutput,
    },
    getRenderer(ctx, clackProgressBarRenderer)
  );
}
