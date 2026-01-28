import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info } from '../../components/icons';
import link from '../../components/link';

const providers = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

export default (provider: string) =>
  dedent(chalk`
    ${info} {bold Speed up Continuous Integration}
    Your project is linked to ${providers[provider]} so Chromatic will report results there.
    This means you can add the option \`with: exitOnceUploaded: true\` to your workflow to skip waiting for build results.
    Read more here: ${link('https://www.chromatic.com/docs/configure/')}
  `);
