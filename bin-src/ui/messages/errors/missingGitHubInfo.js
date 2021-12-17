import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default ({ GITHUB_EVENT_NAME }) =>
  dedent(chalk`
    ${error} {bold Missing GitHub environment variable}
    \`GITHUB_EVENT_NAME\` environment variable set to '${GITHUB_EVENT_NAME}', but \`GITHUB_HEAD_REF\` is not set.
    ${info} Read more at ${link('https://www.chromatic.com/docs/github-actions')}
  `);
