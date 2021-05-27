import task from '../components/task';
import {
  initial,
  skipped,
  validating,
  invalid,
  tracing,
  traced,
  preparing,
  starting,
  uploading,
  success,
  failed,
} from './upload';

export default {
  title: 'CLI/Tasks/Upload',
  decorators: [(storyFn) => task(storyFn())],
};

const isolatorUrl = 'https://5eb48280e78a12aeeaea33cf-kdypokzbrs.chromatic.com/iframe.html';
const storybookUrl = 'https://self-hosted-storybook.netlify.app';

export const Initial = () => initial;

export const Skipped = () => skipped({ options: { storybookUrl } });

export const Validating = () => validating();

export const Invalid = () =>
  invalid({
    sourceDir: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/chromatic-20036LMP9FAlLEjpu',
    buildLogFile: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/build-storybook.log',
  });

export const Tracing = () => tracing({ git: { changedFiles: new Array(3) } });

export const Traced = () =>
  traced({ onlyStoryFiles: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [i])) });

export const Preparing = () => preparing();

export const Starting = () => starting();

export const Uploading = () => uploading({ percentage: 42 });

export const Success = () => success({ now: 0, startedAt: -54321, isolatorUrl });

export const Failed = () => failed({ path: 'main.9e3e453142da82719bf4.bundle.js' });
