/* eslint-disable unicorn/no-null -- GraphQL returns `null` if a value doesn't exist */
import task from '../components/task';
import {
  awaitingUpgrades,
  dryRun,
  failed,
  initial,
  pending,
  publishFailed,
  runOnlyFiles,
  runOnlyNames,
  success,
} from './verify';

export default {
  title: 'CLI/Tasks/Verify',
  decorators: [(storyFunction: any) => task(storyFunction())],
};

const build = {
  number: 42,
  webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
  app: { setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57' },
};

export const Initial = () => initial;

export const DryRun = () => dryRun();

export const Pending = () => pending();

export const PublishFailed = () => publishFailed();

export const RunOnlyChangedFiles = () =>
  runOnlyFiles({
    onlyStoryFiles: Array.from({ length: 12 }),
    options: {},
  } as any);

export const RunOnlyFiles = () =>
  runOnlyFiles({
    options: { onlyStoryFiles: ['./src/**/*.stories.js'] },
  } as any);

export const RunOnlyNames = () =>
  runOnlyNames({
    options: { onlyStoryNames: ['MyComponent/**'] },
  } as any);

export const AwaitingUpgrades = () =>
  awaitingUpgrades({} as any, [{ completedAt: 123 }, { completedAt: null }]);

export const Started = () => success({ build } as any);

export const Published = () => success({ isPublishOnly: true, build } as any);

export const ContinueSetup = () => success({ isOnboarding: true, build } as any);

export const NoStories = () => failed({ options: {} } as any);

export const NoMatches = () =>
  failed({ options: { onlyStoryNames: ['MyComponent/MyStory'] } } as any);
