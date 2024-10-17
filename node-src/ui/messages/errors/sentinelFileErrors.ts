import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';
import link from '../../components/link';

export default () =>
  dedent(chalk`
    ${error} Failed to finalize upload. Please check ${link('https://status.chromatic.com/')} or contact support.
  `);
