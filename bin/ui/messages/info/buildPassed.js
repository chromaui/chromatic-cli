import chalk from 'chalk';
import dedent from 'ts-dedent';

import { info, success } from '../../components/icons';
import link from '../../components/link';
import { stats } from '../../tasks/snapshot';

export default ({ build, isOnboarding }) => {
  const { snapshots, components, specs } = stats({ build });
  return isOnboarding
    ? dedent(chalk`
      ${success} {bold Build passed. Welcome to Chromatic!}
      We found ${components} with ${specs} and took ${snapshots}.
      ${info} Please continue setup at ${link(build.app.setupUrl)}
    `)
    : dedent(chalk`
      ${success} {bold Build ${build.number} passed!}
      No visual changes were found in this build.
      ${info} View build details at ${link(build.webUrl)}
    `);
};
