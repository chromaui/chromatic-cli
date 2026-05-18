import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';
import link from '../../components/link';

export default (currentVersion: string, supportedRange: string) =>
  dedent(chalk`
    ${warning} {bold Unsupported Node.js version}
    You are running Node.js {bold v${currentVersion}}, but Chromatic supports {bold ${supportedRange}}.
    Chromatic may not work as expected. Please upgrade Node.js to a supported version based on Node's release schedule:
    ${link('https://github.com/nodejs/release#release-schedule')}
  `);
