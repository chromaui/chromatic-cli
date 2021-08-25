import chalk from 'chalk';
import dedent from 'ts-dedent';

import { warning } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${warning} {bold Ignoring --only-changed due to rebuild}
    You appear to be rerunning an earlier build, because the baseline build has the same commit and branch name.
    Comparing against the same commit would yield zero changed files, so --only-changed would end up running a build with no snapshots.
    That's probably not what you want when rerunning a build, so we're just going to run a full build instead.
  `);
