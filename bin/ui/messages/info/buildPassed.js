import chalk from 'chalk';
import dedent from 'ts-dedent';

import { info, success } from '../../components/icons';
import link from '../../components/link';
import { stats } from '../../tasks/snapshot';

export default ({ build, inherit, isOnboarding }) => {
  const { changes, snapshots, components, stories } = stats({ build });
  if (inherit) {
    return build.changeCount
      ? dedent(chalk`
        ${success} {bold Build passed!}
        No new snapshots were taken, and ${changes} were previously accepted on the baseline.
        ${info} View baseline build at ${link(build.webUrl)}
      `)
      : dedent(chalk`
        ${success} {bold Build passed!}
        No new snapshots were taken, and the baseline had no changes.
        ${info} View baseline build at ${link(build.webUrl)}
      `);
  }
  if (isOnboarding) {
    return dedent(chalk`
      ${success} {bold Build passed. Welcome to Chromatic!}
      We found ${components} with ${stories} and took ${snapshots}.
      ${info} Please continue setup at ${link(build.app.setupUrl)}
    `);
  }
  return build.autoAcceptChanges && build.changeCount
    ? dedent(chalk`
      ${success} {bold Build ${build.number} passed!}
      Auto-accepted ${changes}.
      ${info} View build details at ${link(build.webUrl)}
    `)
    : dedent(chalk`
      ${success} {bold Build ${build.number} passed!}
      No visual changes were found in this build.
      ${info} View build details at ${link(build.webUrl)}
    `);
};
