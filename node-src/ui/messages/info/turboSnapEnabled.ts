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
  const turboSnap = hashBasedTurboSnap ? 'TurboSnap 2.0' : 'TurboSnap';
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
      Capturing ${captures}; copying ${turboSnaps} with ${turboSnap}.
    `)
    : dedent(chalk`
      ${success} {bold ${turboSnap} enabled}
      Captured ${captures}; copied ${turboSnaps} with ${turboSnap}.
    `);
};
