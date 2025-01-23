import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { isE2EBuild } from '../../../lib/e2eUtils';
import { Context } from '../../../types';
import { info, success } from '../../components/icons';
import link from '../../components/link';
import { stats } from '../../tasks/snapshot';

export default (ctx: Context) => {
  const { snapshots, components, stories, e2eTests } = stats({ build: ctx.build });

  const totalChanges = ctx.build.changeCount + ctx.build.accessibilityChangeCount;

  if (ctx.isOnboarding) {
    const foundString = isE2EBuild(ctx.options)
      ? `We found ${e2eTests} and took ${snapshots}.`
      : `We found ${components} with ${stories} and took ${snapshots}.`;

    return dedent(chalk`
      ${success} {bold Build passed. Welcome to Chromatic!}
      ${foundString}
      ${info} Please continue setup at ${link(ctx.build.app.setupUrl)}
    `);
  }

  const changes: any[] = [];
  if (ctx.build.changeCount > 0) {
    changes.push(pluralize('visual changes', ctx.build.changeCount, true));
  }
  if (ctx.build.accessibilityChangeCount > 0) {
    changes.push(pluralize('accessibility changes', ctx.build.accessibilityChangeCount, true));
  }

  return ctx.build.autoAcceptChanges && totalChanges > 0
    ? dedent(chalk`
      ${success} {bold Build ${ctx.build.number} passed!}
      Auto-accepted ${pluralize('changes', ctx.build.changeCount + ctx.build.accessibilityChangeCount, true)}.
      ${info} View build details at ${link(ctx.build.webUrl)}
    `)
    : dedent(chalk`
      ${success} {bold Build ${ctx.build.number} passed!}
      ${totalChanges > 0 ? changes.join(' and ') : 'No changes'} were found in this build.
      ${info} View build details at ${link(ctx.build.webUrl)}
    `);
};
