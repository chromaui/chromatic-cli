import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export const unparseableConfigurationFile = (configFile: string, err: Error) =>
  dedent(chalk`
    ${error} Configuration file ${chalk.bold(configFile)} could not be parsed, is it valid JSON?

    The error was: ${chalk.bold(err.message)}
  `);
