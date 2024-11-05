import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export const unparseableConfigurationFile = (configFile: string, err: Error) => {
  const language =
    configFile.endsWith('.jsonc') || configFile.endsWith('.json5') ? 'JSON5' : 'JSON';
  return dedent(chalk`
    ${error} Configuration file {bold ${configFile}} could not be parsed, is it valid ${language}?

    The error was: {bold ${err.message}}
    `);
};
