import task from '../components/task';
import {
  buildComplete,
  buildError,
  buildFailed,
  buildPassed,
  initial,
  pending,
  skipped,
} from './snapshot';

export default {
  title: 'CLI/Tasks/Snapshot',
  decorators: [storyFn => task(storyFn())],
};

const build = {
  number: 42,
  errorCount: 1,
  changeCount: 2,
  snapshotCount: 10,
  componentCount: 5,
  specCount: 8,
  features: { uiTests: true },
};

const now = 0;
const startedAt = -123456;

export const Initial = () => initial;

export const Pending = () =>
  pending({
    build,
    options: { only: 'Pages/**' },
    cursor: 6,
    label: 'ComponentName › StoryName',
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

export const BuildFailed = () =>
  buildFailed({
    build,
    now,
    startedAt,
    exitCode: 2,
  });

export const BuildError = () =>
  buildError({
    build,
    now,
    startedAt,
    exitCode: 3,
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
