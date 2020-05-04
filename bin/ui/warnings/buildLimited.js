import chalk from 'chalk';
import dedent from 'ts-dedent';

import { warning } from '../icons';
import link from '../link';

export default ({ billingUrl }) =>
  dedent(chalk`
    ${warning} {bold Build limited}
    Visit ${link(billingUrl)} to verify your billing details.
  `);
