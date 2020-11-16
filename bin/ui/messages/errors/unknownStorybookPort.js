import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default (scriptName) =>
  dedent(chalk`
    ${error} Missing {bold --storybook-port}
    The CLI didn't detect a port in your {bold ${scriptName}} script.
    You must pass a port with the {bold --storybook-port} option.
  `);
