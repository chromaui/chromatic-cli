import path from 'path';

import { createTask, transitionTo } from '../lib/tasks';
import { uploadFiles } from '../lib/uploadFiles';
import { Context, Task } from '../types';
import { initial, starting, success } from '../ui/tasks/uploadShare';

export const uploadShareFiles = async (ctx: Context, _task: Task) => {
  const { paths = [], lengths = [] } = ctx.fileInfo ?? {};

  if (!ctx.share) {
    throw new Error('Missing share context');
  }

  if (!paths.includes('index.html')) {
    throw new Error('Missing index.html — cannot publish without an entry point');
  }

  const { formAction, formFields, keyPrefix } = ctx.share.target;

  const lengthsByPath = new Map(
    lengths.map(({ knownAs, contentLength }) => [knownAs, contentLength])
  );

  const toTarget = (filePath: string) => ({
    filePath,
    formAction,
    formFields: { ...formFields, key: `${keyPrefix}/${filePath}` },
    contentType: '',
    fileKey: '',
    targetPath: filePath,
    localPath: path.join(ctx.sourceDir, filePath),
    contentLength: lengthsByPath.get(filePath) ?? 0,
  });

  type Target = ReturnType<typeof toTarget>;
  const nonIndexTargets: Target[] = [];
  let indexTarget: Target | undefined;
  let totalBytes = 0;

  for (const path of paths) {
    const target = toTarget(path);
    totalBytes += target.contentLength;

    if (path === 'index.html') {
      indexTarget = target;
    } else {
      nonIndexTargets.push(target);
    }
  }

  // Since we're doing multi-phase uploads, we need to track progress across all phases and report
  // it as a single progress value
  let uploadedBytes = 0;
  let lastProgress = 0;
  const onProgress = (progress: number) => {
    uploadedBytes += progress - lastProgress;
    lastProgress = progress;
    ctx.options.experimental_onTaskProgress?.(
      { ...ctx },
      { progress: uploadedBytes, total: totalBytes, unit: 'bytes' }
    );
  };

  // Upload all non-index.html files in parallel, then index.html last — signals CDN readiness
  await uploadFiles(ctx, nonIndexTargets, onProgress);
  lastProgress = 0; // reset progress for next phase
  if (indexTarget) await uploadFiles(ctx, [indexTarget], onProgress);
};

/**
 * Sets up the Listr task for uploading the Storybook to a share URL.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'share',
    title: initial(ctx).title,
    steps: [transitionTo(starting), uploadShareFiles, transitionTo(success, true)],
  });
}
