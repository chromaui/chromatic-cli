import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info } from '../../components/icons';
import link from '../../components/link';

const providers = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  azure: 'Azure DevOps',
};

export default (provider: string, inAction: boolean) =>
  dedent(chalk`
    ${info} {bold Speed up Continuous Integration}
    Your project is linked to ${providers[provider]} so Chromatic will report results there.
    This means you can ${
      inAction
        ? 'add `exitOnceUploaded: true` to the `with` inputs of your workflow step'
        : 'pass the `--exit-once-uploaded` flag'
    } to skip waiting for build results.
    Read more here: ${link('https://www.chromatic.com/docs/configure/')}
  `);
