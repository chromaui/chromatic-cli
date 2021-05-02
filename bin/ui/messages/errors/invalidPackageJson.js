import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default (packagePath) =>
  dedent(chalk`
    ${error} {bold Invalid package.json}
    Found invalid package.json at {bold ${packagePath}}
    Make sure this is a valid Node.js package file, is readable, and contains a {bold "scripts"} block.
  `);
