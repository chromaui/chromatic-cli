import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { success } from '../../components/icons';

export default ({ build, interactive, skipSnapshots }) => {
  const captures = pluralize('snapshot', build.actualCaptureCount, true);
  const skips = pluralize('snapshot', build.inheritedCaptureCount, true);
  return !interactive || skipSnapshots
    ? dedent(chalk`
      ${success} {bold TurboSnap enabled}
      Capturing ${captures} and skipping ${skips}.
    `)
    : dedent(chalk`
      ${success} {bold TurboSnap enabled}
      Captured ${captures} and skipped ${skips}.
    `);
};
