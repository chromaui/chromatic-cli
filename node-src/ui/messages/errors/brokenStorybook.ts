import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { Context } from '../../../types';
import { error } from '../../components/icons';
import link from '../../components/link';

export default (ctx: Context, { failureReason, storybookUrl }) => {
  const visitStorybookLine = ctx.isReactNativeApp
    ? ''
    : `\n    Visit your published Storybook at ${link(storybookUrl)}`;

  return `${dedent(chalk`
    ${error} {bold Failed to extract stories from your Storybook}
    This is usually a problem with your published Storybook, not with Chromatic.

    Build and open your Storybook locally and check the browser console for errors.${visitStorybookLine}
    The following error was encountered while running your Storybook:
  `)}\n\n${failureReason.trim()}`;
};
