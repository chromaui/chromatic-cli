import chalk from 'chalk';
import { dedent } from 'ts-dedent';
import { Context } from '../../../types';

import { warning, info } from '../../components/icons';
import link from '../../components/link';

const docsUrl =
  'https://www.chromatic.com/docs/test#why-do-i-see-build-x-is-based-on-a-commit-without-ancestor-build';

export default ({ announcedBuild, turboSnap }: Pick<Context, 'announcedBuild' | 'turboSnap'>) =>
  turboSnap
    ? dedent(chalk`
      ${warning} {bold TurboSnap disabled due to missing ancestor build}
      An ancestor is required to determine which files have changed since the last Chromatic build.
      This usually happens when rebasing, force-pushing, squash-merging or running against an ephemeral merge commit.
      ${info} Read more at ${link(docsUrl)}
    `)
    : dedent(chalk`
      ${warning} {bold No ancestor build found}
      Build ${announcedBuild.number} is based on a commit without ancestor builds, which is unusual.
      This usually happens when rebasing, force-pushing, squash-merging or running against an ephemeral merge commit.
      ${info} Read more at ${link(docsUrl)}
    `);
