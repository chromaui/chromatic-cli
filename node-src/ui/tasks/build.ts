import path from 'path';

import { getDuration } from '../../lib/tasks';
import { Context } from '../../types';
import { buildType, capitalize } from './utilities';

export const initial = (ctx: Context) => ({
  status: 'initial',
  title: `Build ${buildType(ctx)}`,
});

export const pending = (ctx: Context) =>
  ctx.isReactNativeApp
    ? {
        status: 'pending',
        title: 'Generating story manifest',
        output: 'Generating manifest.json file for React Native build',
      }
    : {
        status: 'pending',
        title: `Building your ${buildType(ctx)}`,
        output: `Running command: ${ctx.buildCommand}`,
      };

export const success = (ctx: Context) =>
  ctx.isReactNativeApp
    ? {
        status: 'success',
        title: `Story manifest generated in ${getDuration(ctx)}`,
        output: `View manifest at ${path.resolve(ctx.options.storybookBuildDir, 'manifest.json')}`,
      }
    : {
        status: 'success',
        title: `${capitalize(buildType(ctx))} built in ${getDuration(ctx)}`,
        output: `View build log at ${ctx.buildLogFile}`,
      };

export const skipped = (ctx: Context) => ({
  status: 'skipped',
  title: `Build ${buildType(ctx)} [skipped]`,
  output: `Using prebuilt ${buildType(ctx)} at ${ctx.options.storybookBuildDir}`,
});

export const skippedForReactNative = (ctx: Context) => ({
  status: 'skipped',
  title: `Build ${buildType(ctx)} [skipped]`,
  output: 'Using prebuilt React Native assets',
});

export const missingBuildDirectoryForReactNative = (ctx: Context) => ({
  status: 'error',
  title: `Build ${buildType(ctx)}`,
  output: 'Build directory required for React Native',
});

export const failed = (ctx: Context) => ({
  status: 'error',
  title: `Building your ${buildType(ctx)}`,
  output: `Command failed: ${ctx.buildCommand}`,
});
