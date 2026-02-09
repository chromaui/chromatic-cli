import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { isE2EBuild } from '../../../lib/e2eUtils';
import { Context } from '../../../types';
import { info, success } from '../../components/icons';
import link from '../../components/link';
import { stats } from '../../tasks/snapshot';
import { buildType, capitalize } from '../../tasks/utils';

export default (ctx: Context) => {
  if (!ctx.storybookUrl) {
    throw new Error('No Storybook URL provided');
  }

  const result = [chalk`${success} {bold ${capitalize(buildType(ctx))} published}`];

  // `ctx.build` is initialized and overwritten in many ways, which means that
  // this can be any kind of build without component and stories information,
  // like PASSED builds, for example
  if (ctx.build.componentCount && ctx.build.specCount) {
    const { components, stories, e2eTests } = stats({ build: ctx.build });

    result.push(
      isE2EBuild(ctx.options) ? `We found ${e2eTests}.` : `We found ${components} with ${stories}.`
    );
  }

  if (!ctx.isReactNativeApp) {
    result.push(`${info} View your ${buildType(ctx)} at ${link(ctx.storybookUrl)}`);
  }

  return dedent(chalk`${result.join('\n')}`);
};
