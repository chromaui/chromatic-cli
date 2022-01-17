import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info } from '../../components/icons';
import link from '../../components/link';

export default () =>
  dedent(chalk`
    ${info} {bold Use our GitHub Action}
    It appears you are using a GitHub Actions workflow, but are not using the official GitHub Action for Chromatic.
    Find it at ${link('https://github.com/marketplace/actions/publish-to-chromatic')}
  `);
