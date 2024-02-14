import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} Missing Storybook base directory ({bold --storybook-base-dir})
    The value should be the relative path from repository root to Storybook project root.
  `);
