import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { HashBasedTurboSnap } from '../../../types';
import { info, warning } from '../../components/icons';
import link from '../../components/link';

const docsUrl = 'https://www.chromatic.com/docs/turbosnap';

/**
 * Explains why TurboSnap 2.0 bailed for the whole build, in words that finish "A full build is
 * required because ...".
 *
 * @param bailReason The Index's `turboSnapHashBailReason`.
 *
 * @returns The reason as a sentence fragment.
 */
export function hashBasedBailReason(bailReason: HashBasedTurboSnap['bailReason']) {
  switch (bailReason) {
    case 'NO_ANCESTORS':
      return 'this build has no ancestor builds';
    case 'NO_ANCESTOR_HASHES':
      return 'no ancestor build has file hashes to compare against';
    case 'NO_ANCESTOR_CONFIGURATION_MATCH':
      return 'the Storybook configuration differs from every ancestor build';
    default:
      return 'this build could not be compared against its ancestor builds';
  }
}

export default ({ hashBasedTurboSnap }: { hashBasedTurboSnap: HashBasedTurboSnap }) =>
  dedent(chalk`
    ${warning} {bold TurboSnap 2.0 disabled}
    A full build is required because ${hashBasedBailReason(hashBasedTurboSnap.bailReason)}.
    ${info} Read more at ${link(docsUrl)}
  `);
