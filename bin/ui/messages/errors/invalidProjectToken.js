import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default ({ projectToken }) =>
  dedent(chalk`
    ${error} Invalid {bold --project-token} '${projectToken}'
    You can find your project token on the Manage screen in your Chromatic project.
    Sign in to Chromatic at ${link('https://www.chromatic.com/start')}
    ${info} Read more at ${link('https://www.chromatic.com/docs/setup')}
  `);
