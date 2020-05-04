import chalk from 'chalk';
import dedent from 'ts-dedent';

import { warning } from '../icons';
import link from '../link';

export default ({ billingUrl }) =>
  dedent(chalk`
    ${warning} {bold Snapshot quota reached}
    This build is limited because your account is out of snapshots for the month.
    Visit ${link(billingUrl)} to upgrade your plan.
  `);
