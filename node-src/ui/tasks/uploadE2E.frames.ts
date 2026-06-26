import { fallbackFailureState } from '../../renderer/engine';
import { clackProgressBarRenderer } from '../../renderer/engine/clack/progressRenderer';
import { captureTask } from '../../renderer/storybook/captureTask';
import { Task } from '../../types';
import { dryRun, failed, finalizing, invalid, starting, success, uploading } from './upload';

// Node-side scenarios for the upload task on an E2E project (the `buildType` copy differs). The
// `?clack` Vite plugin renders each export through the real Clack progress-bar renderer and hands
// the ANSI strings to the browser story (`uploadE2E.stories.ts`).

const ctx = { options: { playwright: true } } as any;
const pending = starting(ctx);

const make = (state: Task, startingState?: Task) =>
  captureTask(state, startingState, clackProgressBarRenderer);

export const Starting = () => make(pending);

export const Uploading = () =>
  make(
    {
      status: 'updating',
      title: pending.title,
      output: uploading(ctx, { percentage: 42 }).output,
      progress: { progress: 42, total: 100, unit: 'bytes' },
    },
    pending
  );

export const Finalizing = () =>
  make({ status: 'updating', title: pending.title, output: finalizing(ctx).output }, pending);

export const Success = () =>
  make(
    success({
      ...ctx,
      now: 0,
      startedAt: -54_321,
      uploadedBytes: 1_234_567,
      uploadedFiles: 42,
      fileInfo: { paths: { length: 42 } },
    }),
    pending
  );

export const SuccessSkippedFiles = () =>
  make(
    success({
      ...ctx,
      now: 0,
      startedAt: -54_321,
      uploadedBytes: 1_234_567,
      uploadedFiles: 42,
      fileInfo: { paths: { length: 100 } },
    }),
    pending
  );

export const SuccessNoFiles = () =>
  make(
    success({ ...ctx, uploadedBytes: 0, uploadedFiles: 0, fileInfo: { paths: { length: 100 } } }),
    pending
  );

export const DryRun = () => make(dryRun(ctx), pending);

export const Invalid = () =>
  make(
    fallbackFailureState(
      pending.title,
      new Error(
        invalid({
          ...ctx,
          sourceDir: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/chromatic-20036LMP9FAlLEjpu',
          buildLogFile: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/build-storybook.log',
        }).output
      )
    ),
    pending
  );

export const Failed = () =>
  make(
    fallbackFailureState(
      pending.title,
      new Error(failed(ctx, { path: 'main.9e3e453142da82719bf4.bundle.js' }).output)
    ),
    pending
  );
