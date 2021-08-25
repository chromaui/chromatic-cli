import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default () =>
  dedent(chalk`
    ${error} {bold Cross-fork PR builds unsupported in custom GitHub workflows}
    GitHub actions triggered by a fork do not report their repository owner, so cannot be properly linked to a pull request in Chromatic.
    Consider using the official Chromatic GitHub Action, or set CHROMATIC_BRANCH to include the forked repository owner (e.g. owner:branch).
    ${info} Read more at ${link('https://www.chromatic.com/docs/github-actions')}
  `);
