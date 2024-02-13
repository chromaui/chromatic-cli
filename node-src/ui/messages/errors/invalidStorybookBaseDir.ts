import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} Invalid value for {bold --storybook-base-dir}.
    {bold --storybook-base-dir} should be a valid directory path to the root of your Storybook build.
  `);
