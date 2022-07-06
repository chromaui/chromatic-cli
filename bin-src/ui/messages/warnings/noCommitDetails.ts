import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info, warning } from '../../components/icons';
import link from '../../components/link';

type BranchRef = { ref: string; sha: string; env: string };
type CommitRef = { ref?: never; sha: string; env?: string };

export default ({ ref, sha, env }: BranchRef | CommitRef) => {
  if (ref) {
    return dedent(chalk`
      ${warning} {bold Branch '${ref}' does not exist}
      We tried to retrieve its latest commit but couldn't find it in your Git history.
      Falling back to ${sha.slice(0, 7)}, but commit details (date, author) will be missing.
      Pull request status updates likely won't work properly.
      Please use our official GitHub Action or forward the pull_request event info to us.
      ${info} Read more at ${link('https://www.chromatic.com/docs/github-actions')}
    `);
  }
  if (env) {
    return dedent(chalk`
      ${warning} {bold Commit ${sha.slice(0, 7)}} does not exist}
      We tried to retrieve the commit details but couldn't find it in your Git history.
      Check your {bold ${env}} environment variable.
      Using it anyway, but commit details (date, author) will be missing.
    `);
  }
  return dedent(chalk`
    ${warning} {bold Commit ${sha.slice(0, 7)} does not exist}
    We tried to retrieve the commit details but couldn't find it in your Git history.
    Using it anyway, but commit details (date, author) will be missing.
  `);
};
