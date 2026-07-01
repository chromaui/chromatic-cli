import { fallbackFailureState } from '../../renderer/engine';
import { clackProgressBarRenderer } from '../../renderer/engine/clack/progressRenderer';
import { captureTask } from '../../renderer/storybook/captureTask';
import { Task } from '../../types';
import { dryRun, failed, finalizing, invalid, starting, success, uploading } from './upload';

// Node-side scenarios for the upload task. The `?clack` Vite plugin runs this module in Node,
// renders each export through the real Clack progress-bar renderer (upload wires the progress bar),
// and hands the resulting ANSI strings to the browser story (`upload.stories.ts`).

const ctx = { options: {} } as any;
const pending = starting(ctx);

const make = (state: Task, startingState?: Task) =>
  captureTask(state, startingState, clackProgressBarRenderer);

export const Starting = () => make(pending);

// The percentage label is output-driven; the bar fill comes from `progress`. ~42% of the way.
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

// A textual-only phase update: the label moves, the bar stays put.
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

// --dry-run self-skips; runTask drives the skipped state through `renderer.succeed`.
export const DryRun = () => make(dryRun(ctx), pending);

// The backend marked the build fully TurboSnapped (kind:'skip'); the upload frame renders bare (the
// engine passes no reason). The TurboSnap success messages render as separate Info messages (see
// `messages/info/buildFullyTurboSnapped.stories.ts`), logged from the task and flushed below.
export const TurboSkipped = () => make({ status: 'skipped', title: pending.title }, pending);

// upload's `failure` transition forks on `ctx.isReactNativeApp`, passing an RN-specific or generic
// title to the engine's fallback failure state (the error body is logged, not shown in the frame).
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

// A generic upload failure on a React Native app: the error is not RN-specific, but the headline
// still forks to the RN title (the `ctx.isReactNativeApp` branch in renderer/upload.ts).
export const FailedReactNative = () =>
  make(
    fallbackFailureState(
      'Publishing your built React Native Storybook',
      new Error(failed(ctx, { path: 'main.9e3e453142da82719bf4.bundle.js' }).output)
    ),
    pending
  );
