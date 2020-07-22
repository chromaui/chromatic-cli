import deviatingOutputDir from './deviatingOutputDir';

export default {
  title: 'CLI/Messages/Warnings',
};

const withCustomScript = { scripts: { 'build:storybook': './run-storybook-build' } };
const withChainedScript = { scripts: { 'build:storybook': 'build-storybook && true' } };
const withNpmRunScript = { scripts: { 'build:storybook': 'npm run build-storybook' } };

const ctx = {
  sourceDir: '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/chromatic-20036LMP9FAlLEjpu',
  options: { buildScriptName: 'build:storybook' },
};

const outputDir = '/users/me/project/storybook-static';

export const DeviatingOutputDir = () =>
  deviatingOutputDir({ ...ctx, packageJson: withCustomScript }, outputDir);

export const DeviatingOutputDirChained = () =>
  deviatingOutputDir({ ...ctx, packageJson: withChainedScript }, outputDir);

export const DeviatingOutputDirNpmRun = () =>
  deviatingOutputDir({ ...ctx, packageJson: withNpmRunScript }, outputDir);
