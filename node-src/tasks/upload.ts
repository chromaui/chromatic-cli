import Listr from 'listr';
import path from 'path';

import { createTask, setOutput, transitionTo } from '../lib/tasks';
import { uploadBuild } from '../lib/upload';
import { throttle } from '../lib/utilities';
import { waitForSentinel } from '../lib/waitForSentinel';
import { Context, FileDesc, Task } from '../types';
import sentinelFileErrors from '../ui/messages/errors/sentinelFileErrors';
import buildTurboSkipped from '../ui/messages/info/buildTurboSkipped';
import deduplicationFailed from '../ui/messages/warnings/deduplicationFailed';
import {
  dryRun,
  failed,
  finalizing,
  initial,
  invalid,
  starting,
  success,
  uploading,
} from '../ui/tasks/upload';

const buildFileList = (ctx: Context, withHashes: boolean): FileDesc[] => {
  const files = ctx.fileInfo?.paths.map<FileDesc>((filePath) => ({
    ...(withHashes && ctx.fileInfo?.hashes && { contentHash: ctx.fileInfo.hashes[filePath] }),
    contentLength:
      ctx.fileInfo?.lengths.find(({ knownAs }) => knownAs === filePath)?.contentLength ?? -1,
    localPath: path.join(ctx.sourceDir, filePath),
    targetPath: filePath,
  }));

  if (!files) {
    throw new Error(invalid(ctx).output);
  }

  return files;
};

const runUploadAndWaitForSentinels = async (ctx: Context, task: Task, files: FileDesc[]) => {
  await uploadBuild(ctx, files, {
    onProgress: throttle(
      (progress, total) => {
        const percentage = Math.round((progress / total) * 100);
        task.output = uploading(ctx, { percentage }).output;
        ctx.options.experimental_onTaskProgress?.({ ...ctx }, { progress, total, unit: 'bytes' });
      },
      // Avoid spamming the logs with progress updates in non-interactive mode
      ctx.options.interactive ? 100 : ctx.env.CHROMATIC_OUTPUT_INTERVAL
    ),
    onError: (error: Error, path?: string) => {
      throw path === error.message ? new Error(failed(ctx, { path }).output) : error;
    },
  });

  if (!ctx.sentinelUrls?.length) return;

  transitionTo(finalizing)(ctx, task);

  // Dedupe sentinels, ignoring query params
  const sentinels = Object.fromEntries(
    ctx.sentinelUrls.map((url) => {
      const { host, pathname } = new URL(url);
      return [host + pathname, { name: pathname.split('/').at(-1) || '', url }];
    })
  );

  await Promise.all(Object.values(sentinels).map((sentinel) => waitForSentinel(ctx, sentinel)));
};

export const uploadStorybook = async (ctx: Context, task: Task) => {
  if (ctx.skip) return;

  try {
    await runUploadAndWaitForSentinels(ctx, task, buildFileList(ctx, true));
  } catch {
    ctx.log.warn(deduplicationFailed());
    // Retry without file deduplication ensuring we reset fields for a new upload
    ctx.sentinelUrls = [];
    ctx.uploadedBytes = 0;
    ctx.uploadedFiles = 0;
    await runUploadAndWaitForSentinels(ctx, task, buildFileList(ctx, false));
  }
};

export const waitForSentinels = async (ctx: Context, task: Task) => {
  if (ctx.skip || !ctx.sentinelUrls?.length) return;
  transitionTo(finalizing)(ctx, task);

  // Dedupe sentinels, ignoring query params
  const sentinels = Object.fromEntries(
    ctx.sentinelUrls.map((url) => {
      const { host, pathname } = new URL(url);
      return [host + pathname, { name: pathname.split('/').at(-1) || '', url }];
    })
  );

  try {
    await Promise.all(Object.values(sentinels).map((sentinel) => waitForSentinel(ctx, sentinel)));
  } catch (err) {
    ctx.log.error(sentinelFileErrors());
    throw err;
  }
};

export const finishUpload = (ctx: Context, task: Task) => {
  // The build may have been marked SKIPPED from the backend detecting no changes from TurboSnap.
  if (ctx.skip) {
    ctx.log.info(buildTurboSkipped());

    // Render as ↓ [skipped] rather than a ✔ checkmark to make it look like we never entered this step.
    setOutput('')(ctx, task); // Clear the "Starting publish" output so no subtitle shows

    // Cast as a real Listr `Task` object which all have a `.skip(message)` method. This allows you
    // to skip after a task has started.
    (task as Listr.ListrTaskWrapper<Context>).skip('');
    return;
  }

  transitionTo(success, true)(ctx, task);
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
    steps: [transitionTo(starting), uploadStorybook, finishUpload],
  });
}
