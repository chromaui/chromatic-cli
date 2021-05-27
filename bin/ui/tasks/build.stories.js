import task from '../components/task';
import { initial, pending, skipped, success, failed } from './build';

export default {
  title: 'CLI/Tasks/Build',
  decorators: [(storyFn) => task(storyFn())],
};

const spawnParams = {
  command: 'yarn',
  clientArgs: ['run', '--silent'],
  scriptArgs: ['build-storybook', '-o', 'storybook-static'],
};

export const Initial = () => initial;

export const Building = () => pending({ spawnParams });

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

export const Failed = () => failed({ spawnParams });
