import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info } from '../../components/icons';
import { skippedRebuild } from '../../tasks/gitInfo';

export default () =>
  dedent(chalk`
    ${info} {bold ${skippedRebuild().output}}
    A build for the same commit as the last build on the branch is considered a rebuild.
    If the last build is passed or accepted, the rebuild is skipped because it shouldn't change anything.
    You can override this using the {bold --force-rebuild} flag.
  `);
