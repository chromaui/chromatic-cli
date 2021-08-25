import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default (options) =>
  dedent(chalk`
    ${error} Incompatible options: ${options.map((opt) => chalk.bold(opt)).join(', ')}
    These options cannot be used together.
  `);
