import chalk from 'chalk';
import dedent from 'ts-dedent';

import { warning } from '../../components/icons';

export default (file) =>
  dedent(chalk`
    ${warning} {bold Ignoring --only-changed}
    Found a change in ${file}
    A full build is required because this file cannot be linked to any specific stories.
  `);
