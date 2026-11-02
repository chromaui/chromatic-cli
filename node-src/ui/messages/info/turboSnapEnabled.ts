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
  hashBasedTurboSnap,
}: Pick<
  Context,
  'build' | 'options' | 'skip' | 'skipSnapshots' | 'ancestorBuild' | 'hashBasedTurboSnap'
>) => {
  // After a 2.0 bail, the Index can still bypass the build with the 1.0 list, so don't credit 2.0.
  const turboSnap =
    hashBasedTurboSnap && !hashBasedTurboSnap.bailed ? 'TurboSnap 2.0' : 'TurboSnap';
  if (skip) {
    const skipped = ancestorBuild
      ? pluralize('snapshot', ancestorBuild.snapshotCount, true)
      : 'snapshots';
    return dedent(chalk`
      ${success} {bold ${turboSnap} enabled}
      Bypassed ${skipped} because no frontend files were changed.
    `);
  }

  const captures = pluralize('snapshot', build.actualCaptureCount, true);
  const turboSnaps = pluralize('snapshot', build.inheritedCaptureCount, true);
  return !options.interactive || skipSnapshots
    ? dedent(chalk`
      ${success} {bold ${turboSnap} enabled}
      Capturing ${captures}; copying ${turboSnaps} with TurboSnap.
    `)
    : dedent(chalk`
      ${success} {bold ${turboSnap} enabled}
      Captured ${captures}; copied ${turboSnaps} with TurboSnap.
    `);
};
