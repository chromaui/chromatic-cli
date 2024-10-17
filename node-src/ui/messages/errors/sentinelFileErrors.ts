import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} Failed to finalize upload. Please check https://status.chromatic.com/ or contact support.
  `);
