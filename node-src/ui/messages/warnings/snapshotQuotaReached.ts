import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';
import link from '../../components/link';

export default ({ billingUrl }: { billingUrl: string }) =>
  dedent(chalk`
    ${warning} {bold Billed snapshot limit reached}
    This build is limited because your account reached its billed snapshot limit for this billing period.
    Visit ${link(billingUrl)} to upgrade your plan.
  `);
