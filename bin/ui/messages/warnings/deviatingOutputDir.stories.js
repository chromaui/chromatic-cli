import deviatingOutputDir from './deviatingOutputDir';

export default {
  title: 'CLI/Messages/Warnings',
};

const ctx = {
  sourceDir: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/chromatic-20036LMP9FAlLEjpu',
  options: { buildScriptName: 'build:storybook' },
  packageJson: { scripts: { 'build:storybook': 'npm run build-storybook' } },
};

export const DeviatingOutputDir = () =>
  deviatingOutputDir(ctx, '/users/me/project/storybook-static');
