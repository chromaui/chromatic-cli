import { getDuration } from '../../lib/tasks';
import { Context } from '../../types';
import { buildType, capitalize } from './utilities';

export const initial = (ctx: Context) => ({
  status: 'initial',
  title: `Build ${buildType(ctx)}`,
});

export const pending = (ctx: Context) => ({
  status: 'pending',
  title: `Building your ${buildType(ctx)}`,
  output: ctx.isReactNativeApp ? 'Building' : `Running command: ${ctx.buildCommand}`,
});

export const pendingManifest = () => ({
  status: 'pending',
  title: 'Generating story manifest',
  output: 'Generating manifest.json file for React Native build',
});

export const pendingAndroid = (ctx: Context) => ({
  status: 'pending',
  title: `Building your ${buildType(ctx)}`,
  output: ctx.options?.reactNative?.androidBuildCommand
    ? `Running command: ${ctx.options.reactNative.androidBuildCommand}`
    : 'Building Android',
});

export const pendingIOS = (ctx: Context) => ({
  status: 'pending',
  title: `Building your ${buildType(ctx)}`,
  output: ctx.options?.reactNative?.iosBuildCommand
    ? `Running command: ${ctx.options.reactNative.iosBuildCommand}`
    : 'Building iOS',
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: `${capitalize(buildType(ctx))} built in ${getDuration(ctx)}`,
  output: `View build log at ${ctx.buildLogFile}`,
});

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

export const failed = (ctx: Context) => ({
  status: 'error',
  title: `Building your ${buildType(ctx)}`,
  output: `Command failed: ${ctx.buildCommand}`,
});
