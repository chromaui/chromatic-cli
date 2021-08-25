import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} {bold No package.json found}
    Chromatic only works from inside a JavaScript project.
    We expected to find a package.json somewhere up the directory tree.
    Are you sure you're running from your project directory?
  `);
