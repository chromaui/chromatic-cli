import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default (scriptName) =>
  dedent(chalk`
    ${error} {bold Start script not found}
    The CLI didn't find a script called {bold "${scriptName}"} in your {bold package.json}.
    Make sure you set the {bold --script-name} option to the value of the script name that starts your Storybook.
  `);
