import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { baseStorybookUrl } from '../../../lib/utils';
import { error } from '../../components/icons';
import link from '../../components/link';

export default ({ failureReason, isolatorUrl }) =>
  `${dedent(chalk`
    ${error} {bold Failed to extract stories from your Storybook}
    This is usually a problem with your published Storybook, not with Chromatic.

    Build and open your Storybook locally and check the browser console for errors.
    Visit your published Storybook at ${link(baseStorybookUrl(isolatorUrl))}
    The following error was encountered while running your Storybook:
  `)}\n\n${failureReason.trim()}`;
