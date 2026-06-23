import { fallbackFailureState } from '../../renderer/engine';
import { captureTask } from '../../renderer/storybook/captureTask';
import { bailed, hashing, invalid, success, traced, tracing, validating } from './prepare';

// Node-side scenarios for the prepare task on an E2E (Playwright) build. The `?clack` Vite plugin
// renders each export through the real Clack renderer for the browser story (`prepareE2E.stories.ts`).

const ctx = { options: { playwright: true } } as any;

const sourceDirectory =
  '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/chromatic-20036LMP9FAlLEjpu';
const buildLogFile = '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/build-storybook.log';

export const Validating = () => captureTask(validating(ctx));

export const Invalid = () =>
  captureTask(
    fallbackFailureState(
      validating(ctx).title,
      new Error(invalid({ ...ctx, sourceDir: sourceDirectory, buildLogFile }).output)
    )
  );

export const Tracing = () =>
  captureTask(
    tracing({ git: { changedFiles: Array.from({ length: 3 }) }, options: ctx.options } as any),
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
    traced({ options: ctx.options, onlyStoryFiles: Array.from({ length: 5 }) } as any),
    validating(ctx)
  );

export const Hashing = () => captureTask(hashing(ctx), validating(ctx));

export const Success = () => captureTask(success(ctx));
