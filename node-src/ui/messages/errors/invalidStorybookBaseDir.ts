import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export const invalidStorybookBaseDir = () =>
  dedent(chalk`
    ${error} TurboSnap disabled until base directory is set correctly
    The base directory allows TurboSnap to trace files.
    Set the {bold --storybook-base-dir} option as the relative path from the repository root to the Storybook project root.
    Run {bold @chromatic-com/turbosnap-helper} to get your base directory value.
  `);
