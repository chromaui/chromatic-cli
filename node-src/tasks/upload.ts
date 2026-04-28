import { createTask, transitionTo } from '../lib/tasks';
import { runUploadPhase } from '../run/phases/upload';
import { Context, Task } from '../types';
import { dryRun, finalizing, initial, starting, success } from '../ui/tasks/upload';

export const runUpload = async (ctx: Context, task: Task) => {
  if (ctx.skip) return;
  const result = await runUploadPhase({
    options: ctx.options,
    env: ctx.env,
    isReactNativeApp: ctx.isReactNativeApp,
    sourceDir: ctx.sourceDir,
    fileInfo: ctx.fileInfo as NonNullable<typeof ctx.fileInfo>,
    announcedBuild: ctx.announcedBuild,
    log: ctx.log,
    ports: ctx.ports,
    onProgress: ({ output }) => {
      ctx.ports.ui.taskUpdate({ output });
    },
  });

  // Compatibility copy: downstream phases still read these via `ctx.*`.
  ctx.uploadedBytes = result.uploadedBytes;
  ctx.uploadedFiles = result.uploadedFiles;
  ctx.sentinelUrls = result.sentinelUrls;

  if (result.sentinelUrls.length > 0) {
    transitionTo(finalizing)(ctx, task);
  }
};

/**
 * Sets up the Listr task for uploading the build assets to Chromatic.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'upload',
    title: initial(ctx).title,
    skip: (ctx: Context) => {
      if (ctx.skip) return true;
      if (ctx.options.dryRun) return dryRun(ctx).output;
      return false;
    },
    steps: [transitionTo(starting), runUpload, transitionTo(success, true)],
  });
}
