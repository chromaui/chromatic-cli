import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default (option, dependsOnOption) =>
  dedent(chalk`
    ${error} Invalid {bold ${option}}
    This option can only be used in conjunction with {bold ${dependsOnOption}}
  `);
