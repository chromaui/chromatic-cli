import deviatingOutputDirectory from './deviatingOutputDirectory';

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

const outputDirectory = '/users/me/project/storybook-static';

export const DeviatingOutputDirectory = () =>
  deviatingOutputDirectory({ ...ctx, packageJson: withCustomScript } as any, outputDirectory);

export const DeviatingOutputDirectoryChained = () =>
  deviatingOutputDirectory({ ...ctx, packageJson: withChainedScript } as any, outputDirectory);

export const DeviatingOutputDirectoryNpmRun = () =>
  deviatingOutputDirectory({ ...ctx, packageJson: withNpmRunScript } as any, outputDirectory);
