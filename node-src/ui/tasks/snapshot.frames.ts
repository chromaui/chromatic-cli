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

// Node-side scenarios for the snapshot task. The `?clack` Vite plugin runs this module in Node,
// renders each export through the real Clack progress-bar renderer (snapshot reports discrete
// snapshot-count progress), and hands the resulting ANSI strings to the browser story
// (`snapshot.stories.ts`).

const ctx = { options: {} } as any;

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

// The bar starts at 0% with a generic subtitle; the persistent header is the (cursor-independent)
// pending title, which `succeed`/`fail` collapse into the completion line.
const start = (context: Context) => pending(context);

// A mid-run progress frame: the label carries the percent + counts (the renderer fills the bar from
// `progress`, so the ascii bar prefix is gone), rendered as an update over the started bar.
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
  progressFrame({ ...ctx, build } as Context, 6, 'ComponentName › StoryName');

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

// Broken/failed/canceled builds aren't pipeline-halting throws — they complete via `renderer.succeed`,
// which renders a green completed frame (Listr did the same: it finished the task without throwing, so
// the `status: 'error'` on these states only ever drove the old `task()` sim). Render them as success
// frames here to match runtime; a distinct red-failure treatment is deferred to a follow-up PR.
const completed = (state: Task) =>
  make({ ...state, status: 'success' }, start({ ...ctx, build } as Context));

export const BuildBroken = () => completed(buildBroken({ ...ctx, build, now, startedAt }));

export const BuildFailed = () => completed(buildFailed({ ...ctx, build, now, startedAt }));

export const BuildCanceled = () => completed(buildCanceled({ ...ctx, build, now, startedAt }));

// --dry-run and the upstream skipSnapshots reasons all self-skip; runTask drives the skipped state
// through `renderer.succeed`.
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
