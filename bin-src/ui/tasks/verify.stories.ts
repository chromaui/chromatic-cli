import task from '../components/task';
import { initial, dryRun, pending, runOnly, runOnlyFiles, success, failed } from './verify';

export default {
  title: 'CLI/Tasks/Verify',
  decorators: [(storyFn: any) => task(storyFn())],
};

const build = {
  number: 42,
  webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
  app: { setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57' },
};

export const Initial = () => initial;

export const DryRun = () => dryRun();

export const Pending = () => pending();

export const RunOnly = () => runOnly({ options: { only: 'MyComponent/MyStory' } } as any);

export const RunOnlyFiles = () =>
  runOnlyFiles({
    onlyStoryFiles: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i])),
  } as any);

export const Started = () => success({ build } as any);

export const Published = () => success({ isPublishOnly: true, build } as any);

export const ContinueSetup = () => success({ isOnboarding: true, build } as any);

export const NoStories = () => failed({ options: {} } as any);

export const NoMatches = () => failed({ options: { only: 'MyComponent/MyStory' } } as any);
