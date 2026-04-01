import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default () => {
  return dedent(chalk`
    ${error} {bold React Native build configuration not found}

    Chromatic needs to know how to build your React Native app. Run setup:

      {bold npx chromatic init}

    Or provide a pre-built directory:

      {bold npx chromatic --storybook-build-dir=<path>}
  `);
};
