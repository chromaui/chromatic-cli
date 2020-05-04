import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../icons';

export default scriptName =>
  dedent(chalk`
    ${error} {bold Start script not found}
    Didn't find a script called {bold "${scriptName}"} in your {bold package.json}.
    Make sure you set the {bold --script-name} option to the value of the npm script that starts your Storybook.
  `);
