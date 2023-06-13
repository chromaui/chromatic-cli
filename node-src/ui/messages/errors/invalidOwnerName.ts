import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default (branchOwner: string, repoOwner: string) =>
  dedent(chalk`
    ${error} Invalid value for {bold --branch-name} and/or {bold --repository-slug}
    The branch owner name prefix '${branchOwner}' does not match the repository owner '${repoOwner}'.
  `);
