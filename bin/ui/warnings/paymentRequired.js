import chalk from 'chalk';
import dedent from 'ts-dedent';

import { warning } from '../icons';
import link from '../link';

export default ({ billingUrl }) =>
  dedent(chalk`
    ${warning} {bold Payment required}
    This build is limited because your account has a payment past due.
    Visit ${link(billingUrl)} to update your billing details.
  `);
