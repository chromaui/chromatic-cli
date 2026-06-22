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

// prepare registers no `failure` transition, so a thrown validation error renders the engine's
// fallback failure state, built from the pending (validating) title and the error message.
const failure = (output: string) =>
  captureTask(fallbackFailureState(validating(ctx).title, new Error(output)));

export const Validating = () => captureTask(validating(ctx));

export const Invalid = () =>
  failure(invalid({ ...ctx, sourceDir: sourceDirectory, buildLogFile }).output);

export const InvalidAndroidArtifact = () => failure(invalidAndroidArtifact().output);

export const InvalidReactNativeAndroidMissing = () =>
  failure(invalidReactNative({ sourceDir: sourceDirectory }, ['storybook.apk']).output);

export const InvalidReactNativeIosMissing = () =>
  failure(invalidReactNative({ sourceDir: sourceDirectory }, ['storybook.app']).output);

export const InvalidReactNativeBothMissing = () =>
  failure(
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
