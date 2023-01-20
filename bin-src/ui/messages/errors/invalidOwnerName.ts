import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default (branchOwner: string, repoOwner: string) =>
  dedent(chalk`
    ${error} Invalid value for {bold --branch-name and/or --repository-slug}
    The owner name prefix '${branchOwner}' on the branch does not match the repository slug '${repoOwner}'.
  `);
