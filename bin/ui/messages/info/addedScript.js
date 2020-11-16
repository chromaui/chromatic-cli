import chalk from 'chalk';
import dedent from 'ts-dedent';

import { info, success } from '../../components/icons';

export default (scriptName) =>
  dedent(chalk`
    ${success} {bold Added script '${scriptName}' to package.json}
    You can now run it here or in CI with 'npm run ${scriptName}' or 'yarn ${scriptName}'.
    
    ${info} Your project token was added to the script via the {bold --project-token} flag.
    If you're running Chromatic via continuous integration, we recommend setting
    the {bold CHROMATIC_PROJECT_TOKEN} environment variable in your CI environment.
    You can then remove the {bold --project-token} from your package.json script.
  `);
