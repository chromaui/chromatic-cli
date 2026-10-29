import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';

export default (configDirectory: string) =>
  dedent(chalk`
    ${warning} {bold TurboSnap 2.0 could not find your Storybook config}
    Did not find a Storybook main config file ({bold main.js}, {bold main.ts}, etc.) in {bold ${configDirectory}}.
    TurboSnap 2.0 skipped this build, so it falls back to TurboSnap 1.0 and your current TurboSnap behavior is unaffected.
    If your Storybook config lives somewhere else, pass {bold --storybook-config-dir <dir>} so Chromatic can find it.
  `);
