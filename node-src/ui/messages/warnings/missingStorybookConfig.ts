import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';

export default (configDirectory: string) =>
  dedent(chalk`
    ${warning} {bold TurboSnap could not find your Storybook config}
    Did not find a Storybook main config file ({bold main.js}, {bold main.ts}, etc.) in {bold ${configDirectory}}.
    If your Storybook config lives somewhere else, pass {bold --storybook-config-dir <dir>} so Chromatic can find it.
  `);
