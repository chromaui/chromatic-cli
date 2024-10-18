import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { isE2EBuild } from '../../../lib/e2eUtils';
import { Context } from '../../../types';
import { info, success } from '../../components/icons';
import link from '../../components/link';
import { stats } from '../../tasks/snapshot';

export default (ctx: Context) => {
  const { changes, snapshots, components, stories, e2eTests } = stats({ build: ctx.build });
  const visualChanges = pluralize('visual changes', ctx.build.changeCount, true);

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
  return ctx.build.autoAcceptChanges && ctx.build.changeCount
    ? dedent(chalk`
      ${success} {bold Build ${ctx.build.number} passed!}
      Auto-accepted ${changes}.
      ${info} View build details at ${link(ctx.build.webUrl)}
    `)
    : dedent(chalk`
      ${success} {bold Build ${ctx.build.number} passed!}
      ${ctx.build.changeCount > 0 ? visualChanges : 'No visual changes'} were found in this build.
      ${info} View build details at ${link(ctx.build.webUrl)}
    `);
};
