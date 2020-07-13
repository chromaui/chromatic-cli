import task from '../components/task';
import { failed, initial, pending, runOnly, success } from './verify';

export default {
  title: 'CLI/Tasks/Verify',
  decorators: [storyFn => task(storyFn())],
};

const build = {
  number: 42,
  webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
  app: { setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57' },
};

export const Initial = () => initial;

export const Pending = () => pending();

export const RunOnly = () => runOnly({ options: { only: 'MyComponent/MyStory' } });

export const Started = () => success({ build });

export const Published = () => success({ isPublishOnly: true, build });

export const ContinueSetup = () => success({ isOnboarding: true, build });

export const NoStories = () => failed({ options: {} });

export const NoMatches = () => failed({ options: { only: 'MyComponent/MyStory' } });
