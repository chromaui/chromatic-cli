import task from '../components/task';
import {
  failed,
  initial,
  missingBuildDirectoryForReactNative,
  pending,
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

export const SkippedForReactNative = () =>
  skippedForReactNative({
    ...ctx,
    isReactNativeApp: true,
  } as any);

export const MissingBuildDirectoryWithReactNative = () =>
  missingBuildDirectoryForReactNative({
    ...ctx,
    isReactNativeApp: true,
  } as any);

export const Failed = () => failed({ ...ctx, buildCommand } as any);
