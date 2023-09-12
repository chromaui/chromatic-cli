import chalk from 'chalk';
import { dedent } from 'ts-dedent';
import type { ZodError } from 'zod';

import { error } from '../../components/icons';

export const invalidConfigurationFile = (configFile: string, err: ZodError) => {
  const { formErrors, fieldErrors } = err.flatten();

  return dedent(chalk`
    ${error} Configuration file {bold configFile} was invalid, please check the allowed keys.
    ${
      formErrors.length
        ? `\n${formErrors.map((msg) => chalk`- {bold ${msg}}`).join('\n    ')}\n\n`
        : ''
    }
    ${Object.entries(fieldErrors)
      .map(([field, msg]) => chalk`- {bold ${field}}: ${msg}`)
      .join('\n    ')}
  `);
};
