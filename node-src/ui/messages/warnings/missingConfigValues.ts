import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';

export const missingConfigValues = (storybookDirectories: any[]) =>
  dedent(chalk`
        ${warning} We detected 2 or more Storybooks in your repository.
        For Chromatic and TurboSnap to work properly, please add the following config flags
        for any subdirectory Storybooks:
        {bold storybookBaseDir: ${storybookDirectories[1].storybookBaseDir}}.
        {bold storybookConfigDir: ${storybookDirectories[1].storybookConfigDir}}.
    `);
