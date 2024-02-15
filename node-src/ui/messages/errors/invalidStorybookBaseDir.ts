import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export const invalidStorybookBaseDir = () =>
  dedent(chalk`
    ${error} Invalid Storybook base directory
    In order to properly trace files for TurboSnap, the Storybook base directory must be a valid path.
    Make sure you set the {bold --storybook-base-dir} option to the relative path from the repository root to the Storybook project root.
  `);
