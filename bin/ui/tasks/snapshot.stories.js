import task from '../components/task';
import { initial, pending, buildPassed, buildComplete, buildFailed, buildError } from './snapshot';

export default {
  title: 'CLI/Tasks/Snapshot',
  decorators: [storyFn => task(storyFn())],
};

const build = {
  number: 1,
  errorCount: 1,
  changeCount: 2,
  snapshotCount: 10,
  componentCount: 5,
  specCount: 8,
  features: { uiTests: true },
};

const startedAt = new Date() - 123456;

export const Initial = () => initial;

export const Pending = () =>
  pending({
    build,
    cursor: 6,
    label: 'ComponentName › StoryName',
  });

export const BuildPassed = () =>
  buildPassed({
    build,
    startedAt,
  });

export const BuildPublished = () =>
  buildPassed({
    build: { ...build, features: { uiTests: false } },
    startedAt,
  });

export const BuildComplete = () =>
  buildComplete({
    build,
    startedAt,
    exitCode: 1,
  });

export const BuildAutoAccepted = () =>
  buildComplete({
    build: { ...build, autoAcceptChanges: true },
    startedAt,
  });

export const BuildFailed = () =>
  buildFailed({
    build,
    startedAt,
    exitCode: 2,
  });

export const BuildError = () =>
  buildError({
    build,
    startedAt,
    exitCode: 3,
  });
