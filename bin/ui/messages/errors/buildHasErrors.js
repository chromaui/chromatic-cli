import chalk from 'chalk';
import pluralize from 'pluralize';
import dedent from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default ({ build, exitCode }) => {
  const errors = pluralize('build error', build.errorCount, true);
  return dedent(chalk`
    ${error} {bold Encountered ${errors}}: failing with exit code ${exitCode}
    Pass {bold --allow-console-errors} to succeed this command regardless of runtime build errors.
    ${info} Review the errors at ${link(build.webUrl)}
  `);
};
