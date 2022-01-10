import noCSFGlobs from './noCSFGlobs';

export default {
  title: 'CLI/Messages/Errors',
};

export const NoCSFGlobs = () =>
  noCSFGlobs({
    statsPath: '/tmp/storybook-static/preview-stats.json',
    storybookDir: '.storybook',
    viewLayer: 'angular',
  });

export const NoCSFGlobsFoundEntry = () =>
  noCSFGlobs({
    statsPath: '/tmp/storybook-static/preview-stats.json',
    storybookDir: '.storybook',
    entryFile: 'config/dashboard/.storybook/generated-stories-entry.js',
  });
