import task from '../components/task';
import {
  bailed,
  dryRun,
  failed,
  hashing,
  initial,
  invalid,
  preparing,
  starting,
  success,
  traced,
  tracing,
  uploading,
  validating,
} from './upload';

export default {
  title: 'CLI/Tasks/Upload',
  decorators: [(storyFn: any) => task(storyFn())],
};

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

export const Hashing = () => hashing();

export const Preparing = () => preparing();

export const Starting = () => starting();

export const Uploading = () => uploading({ percentage: 42 });

export const Success = () =>
  success({
    now: 0,
    startedAt: -54321,
    uploadedBytes: 1234567,
    uploadedFiles: 42,
    fileInfo: { paths: { length: 42 } },
  } as any);

export const SuccessSkippedFiles = () =>
  success({
    now: 0,
    startedAt: -54321,
    uploadedBytes: 1234567,
    uploadedFiles: 42,
    fileInfo: { paths: { length: 100 } },
  } as any);

export const SuccessNoFiles = () => success({} as any);

export const Failed = () => failed({ path: 'main.9e3e453142da82719bf4.bundle.js' });
