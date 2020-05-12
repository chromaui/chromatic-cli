import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default singularOptions =>
  dedent(chalk`
    ${error} Can only use one of {bold ${singularOptions.join(', ')}}
  `);
