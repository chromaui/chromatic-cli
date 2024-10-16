import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { Context } from '../../../types';
import { info, success } from '../../components/icons';
import link from '../../components/link';
import { stats } from '../../tasks/snapshot';
import { buildType, capitalize } from '../../tasks/utils';

export default (ctx: Context) => {
  if (!ctx.storybookUrl) {
    throw new Error('No Storybook URL provided');
  }

  // `ctx.build` is initialized and overwritten in many ways, which means that
  // this can be any kind of build without component and stories information,
  // like PASSED builds, for example
  if (ctx.build.componentCount && ctx.build.specCount) {
    const { components, stories } = stats({ build: ctx.build });
    return dedent(chalk`
      ${success} {bold ${capitalize(buildType(ctx))} published}
      We found ${components} with ${stories}.
      ${info} View your ${buildType(ctx)} at ${link(ctx.storybookUrl)}
    `);
  }

  return dedent(chalk`
    ${success} {bold ${capitalize(buildType(ctx))} published}
    ${info} View your ${buildType(ctx)} at ${link(ctx.storybookUrl)}
  `);
};
