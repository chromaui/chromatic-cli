import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { Context } from '../../../types';
import { success } from '../../components/icons';

// After a 2.0 bail, the Index can still bypass the build with the 1.0 list, so don't credit 2.0.
const turboSnapName = ({ turboSnapOutcome }: Pick<Context, 'turboSnapOutcome'>) =>
  turboSnapOutcome?.mechanism === 'v2' && !turboSnapOutcome.bailed ? 'TurboSnap 2.0' : 'TurboSnap';

/**
 * The message for a build the Index bypassed because TurboSnap found no affected stories.
 *
 * @param ctx The ancestor build whose snapshots carry over, and which TurboSnap decided the build.
 *
 * @returns The message.
 */
export const turboSnapBypassed = (ctx: Pick<Context, 'ancestorBuild' | 'turboSnapOutcome'>) => {
  const skipped = ctx.ancestorBuild
    ? pluralize('snapshot', ctx.ancestorBuild.snapshotCount, true)
    : 'snapshots';
  return dedent(chalk`
    ${success} {bold ${turboSnapName(ctx)} enabled}
    Bypassed ${skipped} because no frontend files were changed.
  `);
};

export default ({
  build,
  options,
  skipSnapshots,
  turboSnapOutcome,
}: Pick<Context, 'build' | 'options' | 'skipSnapshots' | 'turboSnapOutcome'>) => {
  const turboSnap = turboSnapName({ turboSnapOutcome });
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
