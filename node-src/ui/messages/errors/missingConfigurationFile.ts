import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export const missingConfigurationFile = (configFile: string) =>
  dedent(chalk`
    ${error} Configuration file {bold ${configFile}} could not be found.

    Check the {bold --config-file} flag of the CLI.
  `);
