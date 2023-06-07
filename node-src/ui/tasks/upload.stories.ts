import task from '../components/task';
import {
  initial,
  dryRun,
  validating,
  invalid,
  tracing,
  bailed,
  traced,
  preparing,
  starting,
  uploading,
  success,
  failed,
} from './upload';

export default {
  title: 'CLI/Tasks/Upload',
  decorators: [(storyFn: any) => task(storyFn())],
};

const isolatorUrl = 'https://5eb48280e78a12aeeaea33cf-kdypokzbrs.chromatic.com/iframe.html';
const storybookUrl = 'https://self-hosted-storybook.netlify.app';

export const Initial = () => initial;

export const DryRun = () => dryRun();

export const Validating = () => validating();

export const Invalid = () =>
  invalid({
    sourceDir: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/chromatic-20036LMP9FAlLEjpu',
    buildLogFile: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/build-storybook.log',
  } as any);

export const Tracing = () => tracing({ git: { changedFiles: new Array(3) } } as any);

export const BailedPackageFile = () =>
  bailed({ turboSnap: { bailReason: { changedPackageFiles: ['package.json'] } } } as any);

export const BailedLockfile = () =>
  bailed({ turboSnap: { bailReason: { changedPackageFiles: ['yarn.lock'] } } } as any);

export const BailedSiblings = () =>
  bailed({
    turboSnap: {
      bailReason: { changedStorybookFiles: ['.storybook/preview.js', '.storybook/otherfile.js'] },
    },
  } as any);

export const Traced = () => traced({ onlyStoryFiles: Array.from({ length: 5 }) } as any);

export const Preparing = () => preparing();

export const Starting = () => starting();

export const Uploading = () => uploading({ percentage: 42 });

export const Success = () => success({ now: 0, startedAt: -54321, isolatorUrl } as any);

export const Failed = () => failed({ path: 'main.9e3e453142da82719bf4.bundle.js' });
