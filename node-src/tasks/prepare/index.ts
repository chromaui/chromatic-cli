import { getFileHashes } from '../../lib/getFileHashes';
import { createTask, transitionTo } from '../../lib/tasks';
import { Context, Task } from '../../types';
import { hashing, initial, invalid, success, validating } from '../../ui/tasks/prepare';
import { traceChangedFiles } from './traceChangedFiles';
import { validateAndroidArtifact } from './validateAndroidArtifact';
import { validateFiles } from './validateFiles';

/**
 * Calculates file hashes for all files to be uploaded.
 * File hashes are used for deduplication and integrity checking during upload.
 * Skips calculation if file hashing is disabled or the task is being skipped.
 *
 * @param ctx - The CLI context containing file info and options
 * @param task - The current Listr task for UI updates
 */
export async function calculateFileHashes(ctx: Context, task: Task) {
  if (ctx.skip || !ctx.options.fileHashing) return;
  transitionTo(hashing)(ctx, task);

  try {
    if (!ctx.fileInfo) {
      throw new Error(invalid(ctx).output);
    }

    const start = Date.now();
    ctx.fileInfo.hashes = await getFileHashes(
      ctx.fileInfo.paths,
      ctx.sourceDir,
      ctx.env.CHROMATIC_HASH_CONCURRENCY
    );
    ctx.log.debug(`Calculated file hashes in ${Date.now() - start}ms`);
  } catch (err) {
    ctx.log.warn('Failed to calculate file hashes');
    ctx.log.debug(err);
  }
}

/**
 * Sets up the Listr task for preparing the built storybook for upload to Chromatic.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'prepare',
    title: initial(ctx).title,
    skip: (ctx: Context) => {
      return !!ctx.skip;
    },
    steps: [
      transitionTo(validating),
      validateFiles,
      validateAndroidArtifact,
      traceChangedFiles,
      calculateFileHashes,
      transitionTo(success, true),
    ],
  });
}
