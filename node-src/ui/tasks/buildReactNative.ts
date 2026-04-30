import { getDuration } from '../../lib/tasks';
import { Context } from '../../types';

export const initial = () => ({
  status: 'initial',
  title: 'Build React Native Storybook',
});

export const pending = () => ({
  status: 'pending',
  title: 'Building your React Native Storybook',
  output: 'Building',
});

export const pendingManifest = () => ({
  status: 'pending',
  title: 'Generating story manifest',
  output: 'Generating manifest.json file for React Native build',
});

export const pendingAndroid = (ctx: Context) => ({
  status: 'pending',
  title: 'Building your React Native Storybook',
  output: ctx.options?.reactNative?.androidBuildCommand
    ? `Running command: ${ctx.options.reactNative.androidBuildCommand}`
    : 'Building Android',
});

export const pendingIOS = (ctx: Context) => ({
  status: 'pending',
  title: 'Building your React Native Storybook',
  output: ctx.options?.reactNative?.iosBuildCommand
    ? `Running command: ${ctx.options.reactNative.iosBuildCommand}`
    : 'Building iOS',
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: `React Native Storybook built in ${getDuration(ctx)}`,
  output: `View build log at ${ctx.reactNativeBuildLogFile}`,
});

export const skipped = () => ({
  status: 'skipped',
  title: 'Build React Native Storybook [skipped]',
  output: 'Using prebuilt React Native assets',
});

export const failedNoValidPlatforms = () => ({
  status: 'error',
  title: 'Building your React Native Storybook',
  output: 'Unable to build for React Native, your project does not include any supported platforms',
});

export const failed = (ctx: Context) => ({
  status: 'error',
  title: 'Building your React Native Storybook',
  output: `Build failed, see logs at ${ctx.reactNativeBuildLogFile}`,
});
