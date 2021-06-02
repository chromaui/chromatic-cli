import chalk from 'chalk';
import dedent from 'ts-dedent';

import { warning } from '../../components/icons';

export default (file) =>
  dedent(chalk`
    ${warning} {bold Ignoring --only-changed due to matching --externals}
    Found external with changes: {bold ${file}}
  `);
