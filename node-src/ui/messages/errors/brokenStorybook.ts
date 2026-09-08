import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { Context } from '../../../types';
import { error } from '../../components/icons';
import link from '../../components/link';

export default (
  ctx: Pick<Context, 'isReactNativeApp'> & { options?: Pick<Context['options'], 'vitest'> },
  { failureReason, storybookUrl }
) => {
  const visitStorybookLine = ctx.isReactNativeApp
    ? ''
    : `\n    Visit your published Storybook at ${link(storybookUrl)}`;

  if (ctx.options?.vitest) {
    return dedent(chalk`
      ${error} {bold Failed to process your Vitest test run}
      This is usually caused by an issue with your test or configuration, not Chromatic.
      Review the error below, then update the affected test or configuration and rerun Vitest.

      ${failureReason.trim()}

      View the published archives at ${link(storybookUrl)}
    `);
  }

  return `${dedent(chalk`
    ${error} {bold Failed to extract stories from your Storybook}
    This is usually a problem with your published Storybook, not with Chromatic.

    Build and open your Storybook locally and check the browser console for errors.${visitStorybookLine}
    The following error was encountered while running your Storybook:
  `)}\n\n${failureReason.trim()}`;
};
