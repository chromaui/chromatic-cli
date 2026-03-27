import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default (option: string) =>
  dedent(chalk`
    ${error} Invalid {bold ${option}}
    This option is only supported in CI because Chromatic will mutate the local Git checkout to recover missing history.
  `);
