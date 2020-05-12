import chalk from 'chalk';
import pluralize from 'pluralize';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default ({ build, exitCode }) => {
  const errors = pluralize('build error', build.errorCount, true);
  return dedent(chalk`
    ${error} {bold Encountered ${errors}}: failing with exit code ${exitCode}
    Pass {bold --allow-console-errors} to succeed this command regardless of runtime build errors.
  `);
};
