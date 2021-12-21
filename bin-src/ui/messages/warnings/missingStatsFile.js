import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${warning} {bold TurboSnap disabled due to missing stats file}
    Did not find {bold preview-stats.json} in your built Storybook.
    Make sure you pass {bold --webpack-stats-json} when building your Storybook.
  `);
