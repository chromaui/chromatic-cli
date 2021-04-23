import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default () =>
  dedent(chalk`
    ${error} {bold Storybook dependency not found}
    Could not find a supported Storybook viewlayer dependency in your {bold package.json}.
    Make sure you have setup Storybook and are running Chromatic from the same directory.
    ${info} New to Storybook? Read ${link('https://www.chromatic.com/docs/storybook')}
  `);
