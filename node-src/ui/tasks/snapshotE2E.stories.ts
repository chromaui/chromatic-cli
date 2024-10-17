import { exitCodes } from '../../lib/setExitCode';
import task from '../components/task';
import {
  buildBroken,
  buildCanceled,
  buildComplete,
  buildFailed,
  buildPassed,
  dryRun,
  initial,
  pending,
  skipped,
} from './snapshot';

export default {
  title: 'CLI/Tasks/Snapshot/E2E',
  decorators: [(storyFunction) => task(storyFunction())],
};

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
const ctx = { options: { playwright: true } } as any;

const now = 0;
const startedAt = -123_456;

export const Initial = () => initial(ctx);

export const DryRun = () => dryRun(ctx);

export const Pending = () =>
  pending({ ...ctx, build } as any, {
    cursor: 6,
    label: 'Snapshot #1 w1280h720',
  });

export const PendingOnlyChanged = () =>
  pending({ ...ctx, build: { ...build, actualTestCount: 8 }, onlyStoryFiles: [] } as any, {
    cursor: 6,
  });

export const PendingOnlyStoryNames = () =>
  pending(
    {
      ...ctx,
      build: { ...build, actualTestCount: 8 },
      options: { ...ctx.options, onlyStoryNames: ['Pages/**'] },
    } as any,
    { cursor: 6 }
  );

export const BuildPassed = () => buildPassed({ ...ctx, build, now, startedAt } as any);

export const BuildComplete = () =>
  buildComplete({ ...ctx, build, now, startedAt, exitCode: 1 } as any);

export const BuildAutoAccepted = () =>
  buildComplete({ ...ctx, build: { ...build, autoAcceptChanges: true }, now, startedAt } as any);

export const BuildBroken = () =>
  buildBroken({ ...ctx, build, now, startedAt, exitCode: exitCodes.BUILD_HAS_ERRORS } as any);

export const BuildFailed = () =>
  buildFailed({ ...ctx, build, now, startedAt, exitCode: exitCodes.BUILD_FAILED } as any);

export const BuildCanceled = () =>
  buildCanceled({ ...ctx, build, now, startedAt, exitCode: exitCodes.BUILD_WAS_CANCELED } as any);

export const SkippedPublishOnly = () => skipped({ ...ctx, isPublishOnly: true } as any);

export const SkippedList = () =>
  skipped({ ...ctx, options: { ...ctx.options, list: true } } as any);

export const SkippedExitOnceUploaded = () =>
  skipped({ ...ctx, options: { ...ctx.options, exitOnceUploaded: true } } as any);
