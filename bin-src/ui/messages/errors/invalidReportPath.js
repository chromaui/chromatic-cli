import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} Invalid value for {bold --junit-report}
    If you pass a file path, make sure it ends with '.xml'
  `);
