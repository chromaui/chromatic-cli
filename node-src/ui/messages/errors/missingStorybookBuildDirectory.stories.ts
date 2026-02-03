import missingStorybookBuildDirectory from './missingStorybookBuildDirectory';

export default {
  title: 'CLI/Messages/Errors',
};

export const MissingStorybookBuildDirectoryIOS = () => missingStorybookBuildDirectory(['ios']);

export const MissingStorybookBuildDirectoryAndroid = () =>
  missingStorybookBuildDirectory(['android']);

export const MissingStorybookBuildDirectoryBothPlatforms = () =>
  missingStorybookBuildDirectory(['ios', 'android']);

export const MissingStorybookBuildDirectoryNoBrowsers = () => missingStorybookBuildDirectory();
