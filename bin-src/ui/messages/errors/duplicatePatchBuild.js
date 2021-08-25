import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} Invalid value to {bold --patch-build}
    The two branches cannot be identical.
  `);
