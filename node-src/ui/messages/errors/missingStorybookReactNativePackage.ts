import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { MINIMUM_STORYBOOK_REACT_NATIVE_VERSION } from '../../../lib/react-native/validateStorybookVersion';
import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} {bold React Native Storybook package not found}
    Chromatic requires {bold @storybook/react-native} version ${MINIMUM_STORYBOOK_REACT_NATIVE_VERSION} or higher for React Native projects, but this package was not found in your project.
    Please install it and try again.
  `);
