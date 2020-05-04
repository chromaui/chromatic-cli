import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error, info } from '../icons';
import link from '../link';

export default ({ build }) =>
  dedent(chalk`
    ${error} {bold ${build.changeCount} changes detected}: failing with exit code 1
    Pass {bold --exit-zero-on-changes} to succeed this command regardless of changes.
    Pass {bold --auto-accept-changes} to succeed and automatically accept any changes.
    ${info} Read more at ${link('https://www.chromatic.com/docs/test')}
  `);
