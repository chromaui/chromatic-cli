import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} Invalid {bold --exit-once-uploaded}
    This option is only supported when you use an uploaded build.
  `);
