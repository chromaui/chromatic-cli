import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} {bold Build directory required for React Native}
    React Native Storybook requires a pre-built directory containing your .apk (Android) or .app (iOS) and manifest.json files.
    Set the {bold --storybook-build-dir} option to the path of your React Native build output.
  `);
