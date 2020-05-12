import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default buildScriptName =>
  dedent(chalk`
    ${error} {bold Build script not found}
    Didn't find a script called {bold "${buildScriptName}"} in your {bold package.json}.
    Make sure you set the {bold --build-script-name} option to the value of the npm script that builds your Storybook.
  `);
