import { clackProgressBarRenderer } from '../../renderer/engine/clack/progressRenderer';
import { captureTask } from '../../renderer/storybook/captureTask';
import { Context, Task } from '../../types';
import {
  buildBroken,
  buildCanceled,
  buildComplete,
  buildFailed,
  buildPassed,
  dryRun,
  pending,
  skipped,
} from './snapshot';

// Node-side scenarios for the snapshot task on an E2E build. The `?clack` Vite plugin runs this
// module in Node, renders each export through the real Clack progress-bar renderer, and hands the
// resulting ANSI strings to the browser story (`snapshotE2E.stories.ts`).

const ctx = { options: { playwright: true } } as any;

const build = {
  number: 42,
  errorCount: 1,
  changeCount: 2,
  testCount: 10,
  actualTestCount: 10,
  actualCaptureCount: 20,
  componentCount: 5,
  specCount: 8,
  features: { uiTests: true },
};

const now = 0;
const startedAt = -123_456;

const make = (state: Task, starting?: Task) =>
  captureTask(state, starting, clackProgressBarRenderer);

const start = (context: Context) => pending(context);

const progressFrame = (context: Context, cursor: number, label?: string) =>
  make(
    {
      status: 'updating',
      title: pending(context, { cursor, label }).title,
      output: pending(context, { cursor, label }).output,
      progress: { progress: cursor, total: context.build.actualTestCount, unit: 'snapshots' },
    },
    start(context)
  );

export const Pending = () =>
  progressFrame({ ...ctx, build } as Context, 6, 'Snapshot #1 w1280h720');

export const PendingOnlyChanged = () =>
  progressFrame(
    { ...ctx, build: { ...build, actualTestCount: 8 }, onlyStoryFiles: [] } as Context,
    6
  );

export const PendingOnlyStoryNames = () =>
  progressFrame(
    {
      ...ctx,
      build: { ...build, actualTestCount: 8 },
      options: { ...ctx.options, onlyStoryNames: ['Pages/**'] },
    } as Context,
    6
  );

export const BuildPassed = () =>
  make(buildPassed({ ...ctx, build, now, startedAt }), start({ ...ctx, build } as Context));

export const BuildComplete = () =>
  make(buildComplete({ ...ctx, build, now, startedAt }), start({ ...ctx, build } as Context));

export const BuildAutoAccepted = () =>
  make(
    buildComplete({ ...ctx, build: { ...build, autoAcceptChanges: true }, now, startedAt }),
    start({ ...ctx, build } as Context)
  );

// See snapshot.frames.ts: these complete via `renderer.succeed` (green), matching Listr; the red-frame
// treatment is deferred to a follow-up PR.
const completed = (state: Task) =>
  make({ ...state, status: 'success' }, start({ ...ctx, build } as Context));

export const BuildBroken = () => completed(buildBroken({ ...ctx, build, now, startedAt }));

export const BuildFailed = () => completed(buildFailed({ ...ctx, build, now, startedAt }));

export const BuildCanceled = () => completed(buildCanceled({ ...ctx, build, now, startedAt }));

export const DryRun = () => make(dryRun(ctx), start({ ...ctx, build } as Context));

export const SkippedPublishOnly = () =>
  make(skipped({ ...ctx, isPublishOnly: true }), start({ ...ctx, build } as Context));

export const SkippedList = () =>
  make(
    skipped({ ...ctx, options: { ...ctx.options, list: true } }),
    start({ ...ctx, build } as Context)
  );

export const SkippedExitOnceUploaded = () =>
  make(
    skipped({ ...ctx, options: { ...ctx.options, exitOnceUploaded: true } }),
    start({ ...ctx, build } as Context)
  );
