import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default ({ GITHUB_EVENT_NAME }: { GITHUB_EVENT_NAME: string }) =>
  dedent(chalk`
    ${error} {bold Missing GitHub environment variable}
    \`GITHUB_EVENT_NAME\` environment variable is set to '${GITHUB_EVENT_NAME}', but \`GITHUB_SHA\` and \`GITHUB_HEAD_REF\` are not both set.
    ${info} Read more at ${link('https://www.chromatic.com/docs/github-actions')}
  `);
