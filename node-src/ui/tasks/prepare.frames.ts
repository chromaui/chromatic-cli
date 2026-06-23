import { fallbackFailureState } from '../../renderer/engine';
import { captureTask } from '../../renderer/storybook/captureTask';
import {
  bailed,
  hashing,
  invalid,
  invalidAndroidArtifact,
  invalidReactNative,
  success,
  traced,
  tracing,
  validating,
} from './prepare';

// Node-side scenarios for the prepare task. The `?clack` Vite plugin runs this module in Node,
// renders each export through the real Clack renderer, and hands the resulting ANSI strings to the
// browser story (`prepare.stories.ts`).

const ctx = { options: {} } as any;

const sourceDirectory =
  '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/chromatic-20036LMP9FAlLEjpu';
const buildLogFile = '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/build-storybook.log';

// prepare's `failure` transition forks on `ctx.isReactNativeApp`, passing an RN-specific or generic
// title to the engine's fallback failure state (the error body is logged, not shown in the frame).
const failure = (output: string) =>
  captureTask(fallbackFailureState(validating(ctx).title, new Error(output)));

const rnFailure = (output: string) =>
  captureTask(fallbackFailureState('Prepare your built React Native Storybook', new Error(output)));

export const Validating = () => captureTask(validating(ctx));

export const Invalid = () =>
  failure(invalid({ ...ctx, sourceDir: sourceDirectory, buildLogFile }).output);

export const InvalidAndroidArtifact = () => rnFailure(invalidAndroidArtifact().output);

export const InvalidReactNativeAndroidMissing = () =>
  rnFailure(invalidReactNative({ sourceDir: sourceDirectory }, ['storybook.apk']).output);

export const InvalidReactNativeIosMissing = () =>
  rnFailure(invalidReactNative({ sourceDir: sourceDirectory }, ['storybook.app']).output);

export const InvalidReactNativeBothMissing = () =>
  rnFailure(
    invalidReactNative({ sourceDir: sourceDirectory }, ['storybook.apk', 'storybook.app']).output
  );

export const Tracing = () =>
  captureTask(
    tracing({ git: { changedFiles: Array.from({ length: 3 }) }, options: {} } as any),
    validating(ctx)
  );

export const BailedPackageFile = () =>
  captureTask(
    bailed({ turboSnap: { bailReason: { changedPackageFiles: ['package.json'] } } } as any),
    validating(ctx)
  );

export const BailedLockfile = () =>
  captureTask(
    bailed({ turboSnap: { bailReason: { changedPackageFiles: ['yarn.lock'] } } } as any),
    validating(ctx)
  );

export const BailedSiblings = () =>
  captureTask(
    bailed({
      turboSnap: {
        bailReason: { changedStorybookFiles: ['.storybook/preview.js', '.storybook/otherfile.js'] },
      },
    } as any),
    validating(ctx)
  );

export const Traced = () =>
  captureTask(
    traced({ options: {}, onlyStoryFiles: Array.from({ length: 5 }) } as any),
    validating(ctx)
  );

export const Hashing = () => captureTask(hashing(ctx), validating(ctx));

export const Success = () => captureTask(success(ctx));
