import task from '../components/task';
import {
  dryRun,
  failed,
  finalizing,
  initial,
  invalid,
  starting,
  success,
  uploading,
} from './upload';

export default {
  title: 'CLI/Tasks/Upload/E2E',
  decorators: [(storyFunction: any) => task(storyFunction())],
};

const ctx = { options: { playwright: true } } as any;

export const Initial = () => initial(ctx);

export const DryRun = () => dryRun(ctx);

export const Invalid = () =>
  invalid({
    ...ctx,
    sourceDir: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/chromatic-20036LMP9FAlLEjpu',
    buildLogFile: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/build-storybook.log',
  } as any);

export const Starting = () => starting(ctx);

export const Uploading = () => uploading(ctx, { percentage: 42 });

export const Finalizing = () => finalizing(ctx);

export const Success = () =>
  success({
    ...ctx,
    now: 0,
    startedAt: -54_321,
    uploadedBytes: 1_234_567,
    uploadedFiles: 42,
    fileInfo: { paths: { length: 42 } },
  } as any);

export const SuccessSkippedFiles = () =>
  success({
    ...ctx,
    now: 0,
    startedAt: -54_321,
    uploadedBytes: 1_234_567,
    uploadedFiles: 42,
    fileInfo: { paths: { length: 100 } },
  } as any);

export const SuccessNoFiles = () =>
  success({
    ...ctx,
    uploadedBytes: 0,
    uploadedFiles: 0,
    fileInfo: { paths: { length: 100 } },
  } as any);

export const Failed = () => failed(ctx, { path: 'main.9e3e453142da82719bf4.bundle.js' });
