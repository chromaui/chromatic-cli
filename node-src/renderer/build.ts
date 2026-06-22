import { applyBuildOutput, BuildOutput, buildProject, extractBuildInput } from '../tasks/build';
import { Context } from '../types';
import { initial, pending, skipped, success } from '../ui/tasks/build';
import {
  pending as reactNativePending,
  skipped as reactNativeSkipped,
  success as reactNativeSuccess,
} from '../ui/tasks/buildReactNative';
import { runTask } from './engine';
import { clackSpinnerRenderer } from './engine/clack/spinnerRenderer';
import { getRenderer } from './engine/getRenderer';

/**
 * Render the build task.
 *
 * @param ctx The CLI context.
 */
export async function renderBuild(ctx: Context): Promise<void> {
  await runTask(
    ctx,
    {
      name: 'build',
      // Generic until the task starts; the fork-specific copy comes from the transitions below.
      title: initial(ctx).title,
      transitions: {
        pending: (context: Context) =>
          context.isReactNativeApp ? reactNativePending() : pending(context),
        success: (context: Context, output?: BuildOutput) => {
          if (context.isReactNativeApp) {
            return output?.skippedWithPrebuilt ? reactNativeSkipped() : reactNativeSuccess(context);
          }
          return output?.skippedWithPrebuilt ? skipped(context) : success(context);
        },
      },
      extractInput: extractBuildInput,
      run: buildProject,
      applyOutput: applyBuildOutput,
    },
    getRenderer(ctx, clackSpinnerRenderer)
  );
}
