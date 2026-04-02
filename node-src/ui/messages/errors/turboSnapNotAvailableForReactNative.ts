import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} {bold TurboSnap is not supported for Storybook React Native projects.}
    Remove the {bold \`--only-changed\`} flag and re-run the command to continue.
  `);
