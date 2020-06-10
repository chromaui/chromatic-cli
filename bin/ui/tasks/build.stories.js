import task from '../components/task';
import { initial, pending, skipped, success } from './build';

export default {
  title: 'CLI/Tasks/Build',
  decorators: [storyFn => task(storyFn())],
};

export const Initial = () => initial;

export const Building = () =>
  pending({
    spawnParams: { scriptArgs: ['build-storybook', '-o', 'storybook-static'] },
  });

export const Built = () =>
  success({
    now: 0,
    startedAt: -32100,
    buildLogFile: '/users/me/project/build-storybook.log',
  });

export const Skipped = () =>
  skipped({
    options: { storybookBuildDir: '/users/me/project/storybook-static' },
  });
