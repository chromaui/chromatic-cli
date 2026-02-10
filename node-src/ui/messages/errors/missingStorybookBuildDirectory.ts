import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default (browsers: string[] = []) => {
  const hasIOS = browsers.includes('ios');
  const hasAndroid = browsers.includes('android');

  let filesRequired: string;
  if (hasIOS && hasAndroid) {
    filesRequired = 'your storybook.apk (Android), storybook.app (iOS), and manifest.json files';
  } else if (hasIOS) {
    filesRequired = 'your storybook.app and manifest.json files';
  } else if (hasAndroid) {
    filesRequired = 'your storybook.apk and manifest.json files';
  } else {
    // Fallback to generic message if browsers info is not available
    filesRequired =
      'your manifest.json and either your storybook.apk (Android) or storybook.app (iOS) files';
  }

  return dedent(chalk`
    ${error} {bold Build directory required for React Native}
    React Native Storybook requires a pre-built directory containing ${filesRequired}.
    Set the {bold --storybook-build-dir} option to the path of your React Native build output.
  `);
};
