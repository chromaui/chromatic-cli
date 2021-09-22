import missingStories from './missingStories';

export default {
  title: 'CLI/Messages/Errors',
};

export const MissingStories = () =>
  missingStories({
    options: { buildScriptName: 'build:storybook' },
    buildLogFile: '/path/to/project/build-storybook.log',
  });
