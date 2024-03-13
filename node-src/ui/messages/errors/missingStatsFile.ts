import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default ({ legacy }: { legacy: boolean }) =>
  dedent(chalk`
    ${error} {bold TurboSnap disabled due to missing stats file}
    Did not find {bold preview-stats.json} in your built Storybook.
    Make sure you pass {bold ${
      legacy ? `--webpack-stats-json` : `--stats-json`
    }} when building your Storybook.
  `);
