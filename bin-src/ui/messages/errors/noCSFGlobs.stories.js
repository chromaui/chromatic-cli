import noCSFGlobs from './noCSFGlobs';

export default {
  title: 'CLI/Messages/Errors',
};

export const NoCSFGlobs = () => noCSFGlobs({ storybookDir: '.storybook', viewLayer: 'angular' });
