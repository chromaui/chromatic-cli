import chalk from 'chalk';
import dedent from 'ts-dedent';

import { warning } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${warning} {bold Ignoring --only-changed}
    Could not retrieve changed files since baseline commit(s).
    This typically happens after rebasing.
  `);
