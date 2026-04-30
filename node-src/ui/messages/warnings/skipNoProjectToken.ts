import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${warning} {bold Skipping Chromatic build locally because --skip is enabled, but no project token was available, so no build was reported to Chromatic. This may leave the Chromatic GitHub checks pending.}
  `);
