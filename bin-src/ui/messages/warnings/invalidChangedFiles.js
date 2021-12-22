import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning, info } from '../../components/icons';
import link from '../../components/link';

const docsUrl = 'https://www.chromatic.com/docs/turbosnap#how-it-works';

export default () =>
  dedent(chalk`
    ${warning} {bold TurboSnap disabled due to missing git history}
    Could not retrieve changed files since baseline commit(s).
    This typically happens after rebasing, force pushing, or when running against an ephemeral merge commit.
    ${info} Read more at ${link(docsUrl)}
  `);
