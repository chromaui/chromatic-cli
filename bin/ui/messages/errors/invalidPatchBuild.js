import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} Invalid value for {bold --patch-build}
    This option expects two branch names like {bold headbranch...basebranch}
  `);
