import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info, warning } from '../../components/icons';
import link from '../../components/link';

const docsUrl = 'https://www.chromatic.com/docs/turbosnap#how-it-works';

/**
 * Warns that TurboSnap is disabled because the E2E package, which renders every snapshot, changed.
 *
 * @param input The changed package.
 * @param input.packageName The E2E package, such as `@chromatic-com/vitest`.
 *
 * @returns The message.
 */
export default ({ packageName }: { packageName: string }) =>
  dedent(chalk`
    ${warning} {bold TurboSnap disabled due to a dependency change}
    Found a change to {bold ${packageName}}, which renders every snapshot in this build.
    A full build is required because this change cannot be linked to any specific tests.
    ${info} Read more at ${link(docsUrl)}
  `);
