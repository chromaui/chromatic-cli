import buildFailed from './buildFailed';

export default {
  title: 'CLI/Messages/Errors',
};

export const BuildFailed = () =>
  buildFailed(
    {
      options: { buildScriptName: 'build:storybook' },
      buildLogFile: '/path/to/project/build-storybook.log',
    },
    { message: 'Command failed with exit code 1' }
  );
