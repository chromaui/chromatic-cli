import { filesize } from 'filesize';
import pluralize from 'pluralize';

import { isE2EBuild } from '../../lib/e2eUtils';
import { getDuration } from '../../lib/tasks';
import { isPackageManifestFile, progressBar } from '../../lib/utils';
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

export const validating = (ctx: Context) => ({
  status: 'pending',
  title: `Publish your built ${buildType(ctx)}`,
  output: `Validating ${buildType(ctx)} files`,
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

export const tracing = (ctx: Context) => {
  const files = pluralize('file', ctx.git.changedFiles?.length, true);
  const testType = isE2EBuild(ctx.options) ? 'test' : 'story';

  return {
    status: 'pending',
    title: `Retrieving ${testType} files affected by recent changes`,
    output: `Traversing dependencies for ${files} that changed since the last build`,
  };
};

export const bailed = (ctx: Context) => {
  const { changedPackageFiles, changedStorybookFiles, changedStaticFiles } =
    ctx.turboSnap?.bailReason || {};
  const changedFiles = changedPackageFiles || changedStorybookFiles || changedStaticFiles;

  // if all changed files are package.json, message this as a dependency change.
  const allChangedFilesArePackageJson = changedFiles?.every((changedFile) =>
    isPackageManifestFile(changedFile)
  );

  const type = allChangedFilesArePackageJson ? 'dependency ' : '';

  const [firstFile, ...otherFiles] = changedFiles || [];
  const siblings = pluralize('sibling', otherFiles.length, true);
  let output = `Found a ${type}change in ${firstFile}`;
  if (otherFiles.length === 1) output += ' or its sibling';
  if (otherFiles.length > 1) output += ` or one of its ${siblings}`;
  return {
    status: 'pending',
    title: 'TurboSnap disabled',
    output,
  };
};

export const traced = (ctx: Context) => {
  const testType = isE2EBuild(ctx.options) ? 'test' : 'story';
  const files = pluralize(`${testType} file`, ctx.onlyStoryFiles?.length, true);

  return {
    status: 'pending',
    title: `Retrieved ${testType} files affected by recent changes`,
    output: `Found ${files} affected by recent changes`,
  };
};

export const hashing = (ctx: Context) => ({
  status: 'pending',
  title: `Publishing your built ${buildType(ctx)}`,
  output: `Calculating file hashes`,
});

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
