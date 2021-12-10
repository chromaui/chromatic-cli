import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';

export default ({ changedCount, ignoredCount }) =>
  dedent(chalk`
    ${warning} {bold Ignoring changed files}
    ${ignoredCount} of ${changedCount} changed files are ignored due to {bold --untraced} and their dependencies are not traced.
  `);
