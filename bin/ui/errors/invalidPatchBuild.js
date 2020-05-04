import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../icons';

export default () =>
  dedent(chalk`
    ${error} Invalid value to {bold --patch-build}
    Expecting two branch names like {bold headbranch...basebranch}
  `);
