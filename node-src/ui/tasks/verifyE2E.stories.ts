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
  title: 'CLI/Tasks/Verify/E2E',
  decorators: [(storyFunction: any) => task(storyFunction())],
};

const build = {
  number: 42,
  webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
  app: { setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57' },
};

const ctx = { options: { playwright: true } } as any;

export const Initial = () => initial(ctx);

export const DryRun = () => dryRun(ctx);

export const Pending = () => pending(ctx);

export const PublishFailed = () => publishFailed(ctx);

export const RunOnlyChangedFiles = () =>
  runOnlyFiles({
    ...ctx,
    onlyStoryFiles: Array.from({ length: 12 }),
    options: {},
  } as any);

export const RunOnlyFiles = () =>
  runOnlyFiles({
    ...ctx,
    options: { ...ctx.options, onlyStoryFiles: ['./src/**/*.stories.js'] },
  } as any);

export const RunOnlyNames = () =>
  runOnlyNames({
    ...ctx,
    options: { ...ctx.options, onlyStoryNames: ['MyComponent/**'] },
  } as any);

export const AwaitingUpgrades = () =>
  awaitingUpgrades(ctx, [{ completedAt: 123 }, { completedAt: null }]);

export const Started = () => success({ ...ctx, build } as any);

export const Published = () => success({ ...ctx, isPublishOnly: true, build } as any);

export const ContinueSetup = () => success({ ...ctx, isOnboarding: true, build } as any);

export const NoStories = () => failed(ctx);

export const NoMatches = () =>
  failed({ ...ctx, options: { ...ctx.options, onlyStoryNames: ['MyComponent/MyStory'] } } as any);
