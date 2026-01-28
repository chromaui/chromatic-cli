import task from '../components/task';
import { bailed, hashing, initial, invalid, success, traced, tracing, validating } from './prepare';

export default {
  title: 'CLI/Tasks/Prepare',
  decorators: [(storyFunction: any) => task(storyFunction())],
};

const ctx = { options: {} } as any;

export const Initial = () => initial(ctx);

export const Validating = () => validating(ctx);

export const Invalid = () =>
  invalid({
    ...ctx,
    sourceDir: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/chromatic-20036LMP9FAlLEjpu',
    buildLogFile: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/build-storybook.log',
  } as any);

export const InvalidReactNative = () =>
  invalid({
    ...ctx,
    isReactNativeApp: true,
    sourceDir: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/chromatic-20036LMP9FAlLEjpu',
    buildLogFile: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/build-storybook.log',
  } as any);

export const Tracing = () =>
  tracing({ ...ctx, git: { changedFiles: Array.from({ length: 3 }) } } as any);

export const BailedPackageFile = () =>
  bailed({ ...ctx, turboSnap: { bailReason: { changedPackageFiles: ['package.json'] } } } as any);

export const BailedLockfile = () =>
  bailed({ ...ctx, turboSnap: { bailReason: { changedPackageFiles: ['yarn.lock'] } } } as any);

export const BailedSiblings = () =>
  bailed({
    ...ctx,
    turboSnap: {
      bailReason: { changedStorybookFiles: ['.storybook/preview.js', '.storybook/otherfile.js'] },
    },
  } as any);

export const Traced = () => traced({ ...ctx, onlyStoryFiles: Array.from({ length: 5 }) } as any);

export const Hashing = () => hashing(ctx);

export const Success = () => success(ctx);
