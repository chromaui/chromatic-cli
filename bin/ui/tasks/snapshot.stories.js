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

export const Initial = () => initial;
export const Pending = () => pending({ build, cursor: 6 });
export const BuildPassed = () => buildPassed({ build });
export const BuildPublished = () =>
  buildPassed({ build: { ...build, features: { uiTests: false } } });
export const BuildComplete = () => buildComplete({ build, exitCode: 1 });
export const BuildAutoAccepted = () =>
  buildComplete({ build: { ...build, autoAcceptChanges: true } });
export const BuildFailed = () => buildFailed({ build, exitCode: 2 });
export const BuildError = () => buildError({ build, exitCode: 3 });
