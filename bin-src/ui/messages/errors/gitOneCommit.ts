import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default (isGithubAction = false) =>
  isGithubAction
    ? dedent(chalk`
      ${error} {bold Found only one commit}
      This typically means you've checked out a shallow copy of the Git repository, which {bold actions/checkout@v2} does by default.
      In order for Chromatic to correctly determine baseline commits, we need access to the full Git history graph.
      With {bold actions/checkout@v2}, you can enable this by setting 'fetch-depth: 0'.
      ${info} Read more at ${link('https://www.chromatic.com/docs/github-actions')}
    `)
    : dedent(chalk`
      ${error} {bold Found only one commit}
      This typically means you've checked out a shallow copy of the Git repository, which some CI systems do by default.
      In order for Chromatic to correctly determine baseline commits, we need access to the full Git history graph.
      Refer to your CI provider's documentation for details.
    `);
