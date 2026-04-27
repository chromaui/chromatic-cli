import task from '../components/task';
import {
  failed,
  initial,
  pending,
  pendingAndroid,
  pendingIOS,
  pendingManifest,
  skipped,
  skippedForReactNative,
  success,
} from './build';

export default {
  title: 'CLI/Tasks/Build',
  decorators: [(storyFunction) => task(storyFunction())],
};

const ctx = { options: {} } as any;

const buildCommand = 'yarn run build-storybook -o storybook-static';

export const Initial = () => initial(ctx);

export const Building = () => pending({ ...ctx, buildCommand } as any);

export const BuildingReactNative = () => pending({ ...ctx, isReactNativeApp: true } as any);

export const Built = () =>
  success({
    ...ctx,
    now: 0,
    startedAt: -32_100,
    buildLogFile: '/users/me/project/build-storybook.log',
  } as any);

export const BuiltReactNative = () =>
  success({
    ...ctx,
    now: 0,
    startedAt: -32_100,
    options: { storybookBuildDir: '/users/me/project/storybook-static' },
    isReactNativeApp: true,
  } as any);

export const Skipped = () =>
  skipped({
    ...ctx,
    options: { ...ctx.options, storybookBuildDir: '/users/me/project/storybook-static' },
  } as any);

export const SkippedForReactNative = () =>
  skippedForReactNative({
    ...ctx,
    isReactNativeApp: true,
  } as any);

export const BuildingAndroid = () => pendingAndroid({ ...ctx, isReactNativeApp: true } as any);

export const BuildingAndroidWithCommand = () =>
  pendingAndroid({
    ...ctx,
    isReactNativeApp: true,
    options: { reactNative: { androidBuildCommand: 'my-android-build' } },
  } as any);

export const BuildingIOS = () => pendingIOS({ ...ctx, isReactNativeApp: true } as any);

export const BuildingIOSWithCommand = () =>
  pendingIOS({
    ...ctx,
    isReactNativeApp: true,
    options: { reactNative: { iosBuildCommand: 'my-ios-build' } },
  } as any);

export const GeneratingManifest = () => pendingManifest();

export const Failed = () => failed({ ...ctx, buildCommand } as any);
