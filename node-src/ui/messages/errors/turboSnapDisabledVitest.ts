import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

const docsUrl = 'https://www.chromatic.com/docs/vitest/turbosnap';

export const turboSnapDisabledVitest = () =>
  dedent(chalk`
    ${error} TurboSnap failed
    Vitest run did not produce source file information for TurboSnap.
    Make sure you've enabled ${chalk.bold('chromaticPlugin({ turboSnap: true })')} in your test Vitest configuration before running tests.
    ${info} Read more at ${link(docsUrl)}
  `);
