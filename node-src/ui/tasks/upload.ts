import { filesize } from 'filesize';
import pluralize from 'pluralize';

import { getDuration } from '../../lib/tasks';
import { progressBar } from '../../lib/utils';
import { Context } from '../../types';
import { buildType } from './utils';

export const initial = (ctx: Context) => ({
  status: 'initial',
  title: `Publish your built ${buildType(ctx)}`,
});

export const dryRun = (ctx: Context) => ({
  status: 'skipped',
  title: `Publish your built ${buildType(ctx)}`,
  output: 'Skipped due to --dry-run',
});

export const invalid = (ctx: Context, error?: Error) => {
  let output = `Invalid ${buildType(ctx)} build at ${ctx.sourceDir}`;
  if (ctx.buildLogFile) output += ' (check the build log)';
  if (error) output += `: ${error.message}`;
  return {
    status: 'error',
    title: `Publishing your built ${buildType(ctx)}`,
    output,
  };
};

export const starting = (ctx: Context) => ({
  status: 'pending',
  title: `Publishing your built ${buildType(ctx)}`,
  output: `Starting publish`,
});

export const uploading = (ctx: Context, { percentage }: { percentage: number }) => ({
  status: 'pending',
  title: `Publishing your built ${buildType(ctx)}`,
  output: `${progressBar(percentage)} ${percentage}%`,
});

export const finalizing = (ctx: Context) => ({
  status: 'pending',
  title: `Publishing your built ${buildType(ctx)}`,
  output: `Finalizing upload`,
});

export const success = (ctx: Context) => {
  const files = pluralize('file', ctx.uploadedFiles, true);
  const bytes = filesize(ctx.uploadedBytes || 0);
  const skipped =
    ctx.fileInfo?.paths.length && ctx.uploadedFiles && ctx.fileInfo.paths.length > ctx.uploadedFiles
      ? `, skipped ${pluralize('file', ctx.fileInfo.paths.length - ctx.uploadedFiles, true)}`
      : '';

  return {
    status: 'success',
    title: ctx.uploadedBytes ? `Publish complete in ${getDuration(ctx)}` : `Publish complete`,
    output: ctx.uploadedBytes ? `Uploaded ${files} (${bytes})${skipped}` : 'No new files to upload',
  };
};

export const failed = (ctx: Context, { path }: { path: string }) => ({
  status: 'error',
  title: `Publishing your built ${buildType(ctx)}`,
  output: `Failed to upload ${path}`,
});
