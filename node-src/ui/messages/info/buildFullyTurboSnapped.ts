import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${info} No frontend files were changed, so TurboSnap skipped taking any snapshots. This build will not be displayed in Chromatic.
  `);
