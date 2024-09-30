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
  title: 'CLI/Tasks/Snapshot',
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
const options = {};

const now = 0;
const startedAt = -123_456;

export const Initial = () => initial;

export const DryRun = () => dryRun();

export const Pending = () =>
  pending({ build, options } as any, {
    cursor: 6,
    label: 'ComponentName › StoryName',
  });

export const PendingOnlyChanged = () =>
  pending({ build: { ...build, actualTestCount: 8 }, options, onlyStoryFiles: [] } as any, {
    cursor: 6,
  });

export const PendingOnlyStoryNames = () =>
  pending(
    { build: { ...build, actualTestCount: 8 }, options: { onlyStoryNames: ['Pages/**'] } } as any,
    { cursor: 6 }
  );

export const BuildPassed = () => buildPassed({ build, now, startedAt } as any);

export const BuildComplete = () => buildComplete({ build, now, startedAt, exitCode: 1 } as any);

export const BuildAutoAccepted = () =>
  buildComplete({ build: { ...build, autoAcceptChanges: true }, now, startedAt } as any);

export const BuildBroken = () =>
  buildBroken({ build, now, startedAt, exitCode: exitCodes.BUILD_HAS_ERRORS } as any);

export const BuildFailed = () =>
  buildFailed({ build, now, startedAt, exitCode: exitCodes.BUILD_FAILED } as any);

export const BuildCanceled = () =>
  buildCanceled({ build, now, startedAt, exitCode: exitCodes.BUILD_WAS_CANCELED } as any);

export const SkippedPublishOnly = () => skipped({ isPublishOnly: true } as any);

export const SkippedList = () => skipped({ options: { list: true } } as any);

export const SkippedExitOnceUploaded = () =>
  skipped({ options: { exitOnceUploaded: true } } as any);
