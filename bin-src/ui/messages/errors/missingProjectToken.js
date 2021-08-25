import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default () =>
  dedent(chalk`
    ${error} {bold Missing project token}

    Sign in to ${link('https://www.chromatic.com/start')} and create a new project,
    or find your project token on the Manage screen in an existing project.
    Set your project token as the {bold CHROMATIC_PROJECT_TOKEN} environment variable
    or pass the {bold --project-token} command line option.

    ${info} Read more at ${link('https://www.chromatic.com/docs/setup')}
  `);
