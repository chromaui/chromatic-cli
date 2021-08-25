import chalk from 'chalk';
import dedent from 'ts-dedent';

import { info, warning } from '../../components/icons';
import link from '../../components/link';

export default () =>
  dedent(chalk`
    ${warning} {bold Running on a Travis PR build from an internal branch}
    It is recommended to run Chromatic on the push builds from Travis where possible.
    We advise turning on push builds and disabling Chromatic for internal PR builds.
    ${info} Read more at ${link('https://www.chromatic.com/docs/ci#travis-ci')}
  `);
