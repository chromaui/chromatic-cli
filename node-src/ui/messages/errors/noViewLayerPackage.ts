import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default (packageName: string) =>
  dedent(chalk`
    ${error} {bold Storybook package not installed}
    Could not find {bold ${packageName}} in {bold node_modules}.
    Most likely, you forgot to run {bold npm install} or {bold yarn} before running Chromatic.
  `);
