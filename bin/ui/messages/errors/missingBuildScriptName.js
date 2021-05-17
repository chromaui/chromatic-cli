import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default ({ buildScriptName, packagePath }) =>
  dedent(chalk`
    ${error} {bold Build script not found in your package.json}
    The CLI didn't find a script called {bold "${buildScriptName}"} in {bold ${packagePath}}.
    Make sure you set the {bold --build-script-name} option to the value of the script name that builds your Storybook.
  `);
