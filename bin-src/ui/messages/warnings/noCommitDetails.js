import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';

export default (sha, envVar) =>
  envVar
    ? dedent(chalk`
      ${warning} {bold Commit ${sha.substr(0, 7)} does not exist}
      We tried to retrieve the commit details but couldn't find it in your Git history.
      Check your {bold ${envVar}} environment variable.
      Continuing with just the commit hash.
    `)
    : dedent(chalk`
      ${warning} {bold Commit ${sha.substr(0, 7)} does not exist}
      We tried to retrieve the commit details but couldn't find it in your Git history.
      Continuing with just the commit hash.
    `);
