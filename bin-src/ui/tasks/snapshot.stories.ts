import { exitCodes } from '../../lib/setExitCode';
import task from '../components/task';
import {
  buildComplete,
  buildBroken,
  buildPassed,
  buildFailed,
  buildCanceled,
  initial,
  dryRun,
  pending,
  skipped,
} from './snapshot';

export default {
  title: 'CLI/Tasks/Snapshot',
  decorators: [(storyFn) => task(storyFn())],
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
const options = {};

const now = 0;
const startedAt = -123456;

export const Initial = () => initial;

export const DryRun = () => dryRun();

export const Pending = () =>
  pending({ build, options } as any, {
    cursor: 6,
    label: 'ComponentName › StoryName',
  });

export const PendingOnly = () =>
  pending({ build: { ...build, actualTestCount: 8 }, options: { only: 'Pages/**' } } as any, {
    cursor: 6,
  });

export const PendingOnlyChanged = () =>
  pending({ build: { ...build, actualTestCount: 8 }, options, onlyStoryFiles: {} } as any, {
    cursor: 6,
  });

export const BuildPassed = () =>
  buildPassed({
    build,
    now,
    startedAt,
  });

export const BuildComplete = () =>
  buildComplete({
    build,
    now,
    startedAt,
    exitCode: 1,
  });

export const BuildAutoAccepted = () =>
  buildComplete({
    build: { ...build, autoAcceptChanges: true },
    now,
    startedAt,
  });

export const BuildBroken = () =>
  buildBroken({
    build,
    now,
    startedAt,
    exitCode: exitCodes.BUILD_HAS_ERRORS,
  });

export const BuildFailed = () =>
  buildFailed({
    build,
    now,
    startedAt,
    exitCode: exitCodes.BUILD_FAILED,
  });

export const BuildCanceled = () =>
  buildCanceled({
    build,
    now,
    startedAt,
    exitCode: exitCodes.BUILD_WAS_CANCELED,
  });

export const SkippedPublishOnly = () =>
  skipped({
    isPublishOnly: true,
  });

export const SkippedList = () =>
  skipped({
    options: { list: true },
  });

export const SkippedExitOnceUploaded = () =>
  skipped({
    options: { exitOnceUploaded: true },
  });
