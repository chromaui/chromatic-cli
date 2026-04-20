import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { MINIMUM_STORYBOOK_REACT_NATIVE_VERSION } from '../../../lib/react-native/validateStorybookVersion';
import { error } from '../../components/icons';

export default (installedVersion: string) =>
  dedent(chalk`
    ${error} {bold Unsupported Storybook React Native version}
    Chromatic requires {bold @storybook/react-native} version ${MINIMUM_STORYBOOK_REACT_NATIVE_VERSION} or higher for React Native projects.
    Installed version: {bold ${installedVersion}}
    Please upgrade to a supported version.
  `);
