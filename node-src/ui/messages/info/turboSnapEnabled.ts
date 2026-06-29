import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { Context } from '../../../types';
import { success } from '../../components/icons';

export default ({
  build,
  options,
  skip,
  skipSnapshots,
  ancestorBuild,
}: Pick<Context, 'build' | 'options' | 'skip' | 'skipSnapshots' | 'ancestorBuild'>) => {
  if (skip) {
    const skipped = ancestorBuild
      ? pluralize('snapshot', ancestorBuild.snapshotCount, true)
      : 'snapshots';
    return dedent(chalk`
      ${success} {bold TurboSnap enabled}
      Skipped capturing ${skipped} because no frontend files were changed.
    `);
  }

  const captures = pluralize('snapshot', build.actualCaptureCount, true);
  const turboSnaps = pluralize('TurboSnap', build.inheritedCaptureCount, true);
  return !options.interactive || skipSnapshots
    ? dedent(chalk`
      ${success} {bold TurboSnap enabled}
      Capturing ${captures}, copying ${turboSnaps}.
    `)
    : dedent(chalk`
      ${success} {bold TurboSnap enabled}
      Captured ${captures}, copied ${turboSnaps}.
    `);
};
