import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default ({ command }) =>
  dedent(chalk`
    ${error} {bold Unable to execute command}: ${command}
    Chromatic requires your Git repository to have at least one commit.
  `);
