import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default ({ TRAVIS_EVENT_TYPE }) =>
  dedent(chalk`
    ${error} {bold Missing Travis environment variable}
    \`TRAVIS_EVENT_TYPE\` environment variable set to '${TRAVIS_EVENT_TYPE}', but
    \`TRAVIS_PULL_REQUEST_SHA\` and \`TRAVIS_PULL_REQUEST_BRANCH\` are not both set.
    ${info} Read more at ${link('https://www.chromatic.com/docs/ci#travis-ci')}
  `);
