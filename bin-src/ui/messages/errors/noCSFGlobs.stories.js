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
