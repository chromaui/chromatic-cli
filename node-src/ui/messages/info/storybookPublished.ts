import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { baseStorybookUrl } from '../../../lib/utils';
import { Context } from '../../../types';
import { info, success } from '../../components/icons';
import link from '../../components/link';
import { stats } from '../../tasks/snapshot';

export default ({ build }: Pick<Context, 'build'>) => {
  const { components, stories } = stats({ build });
  return dedent(chalk`
    ${success} {bold Storybook published}
    We found ${components} with ${stories}.
    ${info} View your Storybook at ${link(baseStorybookUrl(build.cachedUrl))}
  `);
};
