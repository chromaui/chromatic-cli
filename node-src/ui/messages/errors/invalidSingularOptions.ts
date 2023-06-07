import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default (singularOptions: string[]) =>
  dedent(chalk`
    ${error} You can only use one of {bold ${singularOptions.join(', ')}}
  `);
