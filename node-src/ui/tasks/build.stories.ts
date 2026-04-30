import task from '../components/task';
import { failed, initial, pending, skipped, success } from './build';
import {
  failed as failedReactNative,
  pendingAndroid,
  pendingIOS,
  pendingManifest,
  skipped as skippedReactNative,
  success as successReactNative,
} from './buildReactNative';

export default {
  title: 'CLI/Tasks/Build',
  decorators: [(storyFunction) => task(storyFunction())],
};

const ctx = { options: {} } as any;

const buildCommand = 'yarn run build-storybook -o storybook-static';

export const Initial = () => initial(ctx);

export const Building = () => pending({ ...ctx, buildCommand } as any);

export const Built = () =>
  success({
    ...ctx,
    now: 0,
    startedAt: -32_100,
    buildLogFile: '/users/me/project/build-storybook.log',
  } as any);

export const Skipped = () =>
  skipped({
    ...ctx,
    options: { ...ctx.options, storybookBuildDir: '/users/me/project/storybook-static' },
  } as any);

export const Failed = () => failed({ ...ctx, buildCommand } as any);

export const BuiltReactNative = () =>
  successReactNative({
    ...ctx,
    now: 0,
    startedAt: -32_100,
    reactNativeBuildLogFile: '/users/me/project/storybook-static/.chromatic/react-native-build.log',
  } as any);

export const SkippedForReactNative = () => skippedReactNative();

export const BuildingAndroid = () => pendingAndroid({ ...ctx } as any);

export const BuildingAndroidWithCommand = () =>
  pendingAndroid({
    ...ctx,
    options: { reactNative: { androidBuildCommand: 'my-android-build' } },
  } as any);

export const BuildingIOS = () => pendingIOS({ ...ctx } as any);

export const BuildingIOSWithCommand = () =>
  pendingIOS({
    ...ctx,
    options: { reactNative: { iosBuildCommand: 'my-ios-build' } },
  } as any);

export const GeneratingManifest = () => pendingManifest();

export const FailedReactNative = () =>
  failedReactNative({
    ...ctx,
    reactNativeBuildLogFile: '/path/to/project/storybook-static/.chromatic/react-native-build.log',
  } as any);
