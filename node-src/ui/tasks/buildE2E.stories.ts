import task from '../components/task';
import { failed, initial, pending, skipped, success } from './build';

export default {
  title: 'CLI/Tasks/Build/E2E',
  decorators: [(storyFunction) => task(storyFunction())],
};

const ctx = { options: { playwright: true } } as any;

const buildCommand = 'yarn build-archive-storybook';

export const Initial = () => initial(ctx);

export const Building = () => pending({ ...ctx, buildCommand } as any);

export const Built = () =>
  success({
    ...ctx,
    now: 0,
    startedAt: -32_100,
    buildLogFile: '/users/me/project/build-archive.log',
  } as any);

export const Skipped = () =>
  skipped({
    ...ctx,
    options: { ...ctx.options, storybookBuildDir: '/users/me/project/archive-static' },
  } as any);

export const Failed = () => failed({ ...ctx, buildCommand } as any);
