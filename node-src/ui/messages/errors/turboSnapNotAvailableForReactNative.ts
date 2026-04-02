import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} {bold TurboSnap (\`--only-changed\`) is not supported for React Native projects.}
    Remove the {bold --only-changed} flag to continue.
  `);
