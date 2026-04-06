import pluralize from 'pluralize';

import { isE2EBuild } from '../../lib/e2eUtils';
import { isPackageManifestFile } from '../../lib/utilities';
import { Context } from '../../types';
import { buildType } from './utilities';

export const initial = (ctx: Context) => ({
  status: 'initial',
  title: `Prepare your built ${buildType(ctx)}`,
});

export const validating = (ctx: Context) => ({
  status: 'pending',
  title: `Prepare your built ${buildType(ctx)}`,
  output: `Validating ${buildType(ctx)} files`,
});

export const invalid = (ctx: Context, error?: Error) => {
  let output = `Invalid ${buildType(ctx)} build at ${ctx.sourceDir}`;
  if (ctx.buildLogFile) output += ' (check the build log)';
  if (error) output += `: ${error.message}`;
  return {
    status: 'error',
    title: `Preparing your built ${buildType(ctx)}`,
    output,
  };
};

export const invalidReactNative = (ctx: Context, missingFiles: string[] = []) => {
  const lines: string[] = [];

  if (missingFiles.length > 0) {
    const directory = ctx.sourceDir ? ` and place it in directory ${ctx.sourceDir}` : '';
    lines.push('Missing files:');

    for (const file of missingFiles) {
      if (file === 'storybook.apk') {
        lines.push(
          `- storybook.apk — rename your Android Storybook build to storybook.apk${directory}`
        );
      } else if (file === 'storybook.app') {
        lines.push(
          `- storybook.app — rename your iOS Storybook build to storybook.app${directory}`
        );
      } else {
        lines.push(`- ${file}`);
      }
    }
  }

  // Listr will display the last line of the output so we'll set the UI to a generic error message
  // with all the context above.
  lines.push('', `Invalid React Native Storybook build in directory ${ctx.sourceDir}`);

  return {
    status: 'error',
    title: 'Preparing your built React Native Storybook',
    output: lines.join('\n'),
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
  title: `Prepare your built ${buildType(ctx)}`,
  output: `Calculating file hashes`,
});

export const success = (ctx: Context) => {
  return {
    status: 'success',
    title: 'Preparation complete',
    output: `${buildType(ctx)} files validated and prepared for upload`,
  };
};
