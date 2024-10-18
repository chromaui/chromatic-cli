import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info, warning } from '../../components/icons';
import link from '../../components/link';

const docsUrl =
  'https://www.chromatic.com/docs/custom-ci-provider/#overriding-chromatics-branch-detection';

export default () => {
  return dedent(chalk`
    ${warning} Removing unknown owner prefix from branch name.
    You may wish to set the branch directly to avoid incorrect values.
    ${info} Read more at ${link(docsUrl)}
  `);
};
