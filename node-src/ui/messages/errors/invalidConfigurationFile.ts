import chalk from 'chalk';
import { dedent } from 'ts-dedent';
import type { ZodError } from 'zod';

import { error } from '../../components/icons';

export const invalidConfigurationFile = (configFile: string, err: ZodError) => {
  const { formErrors, fieldErrors } = err.flatten();

  return dedent(chalk`
    ${error} Configuration file {bold ${configFile}} was invalid, please check the allowed keys.
    ${
      formErrors.length > 0
        ? `\n${formErrors.map((message) => chalk`- {bold ${message}}`).join('\n    ')}\n\n`
        : ''
    }
    ${Object.entries(fieldErrors)
      .map(([field, message]) => chalk`- {bold ${field}}: ${message}`)
      .join('\n    ')}
  `);
};
