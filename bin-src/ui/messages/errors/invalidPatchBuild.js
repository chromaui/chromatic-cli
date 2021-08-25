import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

const docsUrl = 'https://www.chromatic.com/docs/branching-and-baselines#patch-builds';

export default () =>
  dedent(chalk`
    ${error} Invalid value for {bold --patch-build}
    This option expects two branch names like {bold headbranch...basebranch}
    ${info} Read more at ${link(docsUrl)}
  `);
