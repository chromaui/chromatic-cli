import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';

export default (configDirectory: string) =>
  dedent(chalk`
    ${warning} {bold TurboSnap v2 could not find your Storybook config}
    Did not find a Storybook main config file ({bold main.js}, {bold main.ts}, etc.) in {bold ${configDirectory}}.
    TurboSnap v2 skipped this build; your current TurboSnap behavior is unaffected.
    If your Storybook config lives somewhere else, pass {bold --storybook-config-dir <dir>} so Chromatic can find it.
  `);
