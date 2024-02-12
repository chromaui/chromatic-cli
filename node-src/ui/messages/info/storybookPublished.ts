import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { Context } from '../../../types';
import { info, success } from '../../components/icons';
import link from '../../components/link';
import { stats } from '../../tasks/snapshot';

export default ({ build, storybookUrl }: Pick<Context, 'build' | 'storybookUrl'>) => {
  // `ctx.build` is initialized and overwritten in many ways, which means that
  // this can be any kind of build without component and stories information,
  // like PASSED builds, for example
  const buildStats = build ? stats({ build }) : null;
  if (buildStats?.components && buildStats?.stories) {
    return dedent(chalk`
      ${success} {bold Storybook published}
      We found ${buildStats.components} with ${buildStats.stories}.
      ${info} View your Storybook at ${link(storybookUrl)}
    `);
  }

  return dedent(chalk`
    ${success} {bold Storybook published}
    ${info} View your Storybook at ${link(storybookUrl)}
  `);
};
