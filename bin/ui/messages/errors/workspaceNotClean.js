import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} {bold Workspace not clean}
    The git working directory must be clean before running a patch build.
    Use {bold git stash --include-untracked --keep-index} to stash changes before you continue.
  `);
