import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning, info } from '../../components/icons';
import link from '../../components/link';

const docsUrl =
  'https://www.chromatic.com/docs/test#why-do-i-see-build-x-is-based-on-a-commit-without-ancestor-build';

export default ({ build, turboSnapEnabled }) =>
  turboSnapEnabled
    ? dedent(chalk`
      ${warning} {bold Ignoring --only-changed because no ancestor was found}
      TurboSnap requires an ancestor build to determine which files changed.
      ${info} Read more at ${link(docsUrl)}
    `)
    : dedent(chalk`
      ${warning} {bold No ancestor build found}
      Build ${build.number} is based on a commit without ancestor builds, which is unusual.
      ${info} Read more at ${link(docsUrl)}
    `);
